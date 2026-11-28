import { handleMailTransfer } from './mail-transfer';

export interface Env {
  CRON_SECRET: string;
  APP_URL: string;
  WEBMAIL_URL: string;
  STALWART_URL: string;
  STALWART_ADMIN_USER?: string;
  STALWART_ADMIN_TOKEN?: string;
  BACKUP_BUCKET: R2Bucket;
  BACKUP_UPLOAD_SECRET?: string;
  REVLET_MAIL_TRANSFER_SECRET?: string;
  UPLOAD_TICKETS: R2Bucket;
  INBOUND_PROBE_ACCOUNT_ID?: string;
  INBOUND_PROBE_SUBJECT?: string;
}

interface StalwartHealthReport {
  ok: boolean;
  checkedAt: string;
  healthzOk: boolean;
  healthzStatus: number;
  queueVerified: boolean;
  inboundProbe: 'not-configured' | 'unavailable' | 'stale' | 'received';
  queuedCount: number;
  stuckCount: number;
  failingMessages: Array<{
    id: string;
    returnPath: string;
    recipients: string[];
    error: string;
    retryCount: number;
  }>;
}

async function checkStalwartHealthAndQueue(env: Env): Promise<StalwartHealthReport> {
  const checkedAt = new Date().toISOString();
  let baseUrl = env.STALWART_URL || 'https://mx.revlet.me';
  while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

  let healthzOk = false;
  let healthzStatus = 0;
  try {
    const hRes = await fetch(`${baseUrl}/healthz/live`, { method: 'GET', signal: AbortSignal.timeout(5000) });
    healthzStatus = hRes.status;
    healthzOk = hRes.ok;
  } catch {
    healthzOk = false;
  }

  let queueVerified = false;
  const probeAccount = env.INBOUND_PROBE_ACCOUNT_ID?.trim();
  const probeSubject = env.INBOUND_PROBE_SUBJECT?.trim();
  let inboundProbe: StalwartHealthReport['inboundProbe'] = probeAccount && probeSubject ? 'unavailable' : 'not-configured';
  let queuedCount = 0;
  let stuckCount = 0;
  const failingMessages: StalwartHealthReport['failingMessages'] = [];

  if (env.STALWART_ADMIN_USER && env.STALWART_ADMIN_TOKEN) {
    try {
      const auth = btoa(`${env.STALWART_ADMIN_USER}:${env.STALWART_ADMIN_TOKEN}`);
      const qRes = await fetch(`${baseUrl}/jmap/`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:stalwart:jmap'],
          methodCalls: [
            ['x:QueuedMessage/get', { accountId: 'b', ids: null }, 'qm'],
            ...(probeAccount && probeSubject ? [['Email/query', { accountId: probeAccount, filter: {
              after: new Date(Date.now() - 30 * 60 * 1000).toISOString(), subject: probeSubject,
            }, limit: 1 }, 'inboundProbe']] : []),
          ],
        }),
      });
      if (qRes.ok) {
        const data = (await qRes.json()) as any;
        const response = data?.methodResponses?.find((entry: any) => entry[0] === 'x:QueuedMessage/get' && entry[2] === 'qm');
        const list: any[] = Array.isArray(response?.[1]?.list) ? response[1].list : [];
        queueVerified = Array.isArray(response?.[1]?.list);
        queuedCount = list.length;
        if (probeAccount && probeSubject) {
          const probe = data?.methodResponses?.find((entry: any) => entry[0] === 'Email/query' && entry[2] === 'inboundProbe');
          if (Array.isArray(probe?.[1]?.ids)) inboundProbe = probe[1].ids.length ? 'received' : 'stale';
        }
        const tenMinAgo = Date.now() - 10 * 60 * 1000;

        for (const msg of list) {
          const createdMs = msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now();
          const recips = msg.recipients || {};
          const recipAddrs = Object.keys(recips);
          let errText = '';
          let maxRetry = 0;
          for (const r of Object.values(recips) as any[]) {
            if (typeof r?.retryCount === 'number' && r.retryCount > maxRetry) {
              maxRetry = r.retryCount;
            }
            if (r?.status?.errorMessage) {
              errText = String(r.status.errorMessage);
            }
          }
          if (createdMs < tenMinAgo || errText) {
            stuckCount++;
            failingMessages.push({
              id: String(msg.id || ''),
              returnPath: String(msg.returnPath || ''),
              recipients: recipAddrs,
              error: errText || 'Queued > 10 minutes',
              retryCount: maxRetry,
            });
          }
        }
      }
    } catch (err: any) {
      console.error('[Monitor] Failed to query Stalwart queue:', err?.message || err);
    }
  }

  return {
    ok: healthzOk && queueVerified && stuckCount === 0 &&
      (inboundProbe === 'not-configured' || inboundProbe === 'received'),
    queueVerified,
    inboundProbe,
    checkedAt,
    healthzOk,
    healthzStatus,
    queuedCount,
    stuckCount,
    failingMessages,
  };
}

function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  return Boolean(env.CRON_SECRET && token && token === env.CRON_SECRET);
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;
    const authHeader = {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Cloudflare-Worker-Cron/1.0',
    };

    console.log(`[Cron Triggered] schedule=${cron} at=${new Date().toISOString()}`);

    try {
      if (cron === '0 */6 * * *') {
        const res = await fetch(`${env.APP_URL}/api/cron/schedule-run`, {
          method: 'POST',
          headers: authHeader,
        });
        console.log(`[revlet-schedule-run] status=${res.status}`);
        if (!res.ok) throw new Error(`revlet-schedule-run failed with HTTP ${res.status}`);
      } else if (cron === '5 0 * * *') {
        const res = await fetch(`${env.APP_URL}/api/mail/v1/quota/reset`, {
          method: 'POST',
          headers: authHeader,
        });
        console.log(`[revlet-quota-reset] status=${res.status}`);
        if (!res.ok) throw new Error(`revlet-quota-reset failed with HTTP ${res.status}`);
      } else if (cron === '0 2 * * *') {
        const res = await fetch(`${env.APP_URL}/api/mail/v1/purge-expired`, {
          method: 'POST',
          headers: authHeader,
        });
        console.log(`[revlet-purge-expired] status=${res.status}`);
        if (!res.ok) throw new Error(`revlet-purge-expired failed with HTTP ${res.status}`);
      } else if (cron === '*/15 * * * *') {
        const health = await checkStalwartHealthAndQueue(env);
        console.log(`[stalwart-monitor] ok=${health.ok} queued=${health.queuedCount} stuck=${health.stuckCount}`);
        if (!health.ok) {
          console.error('[ALERT] Stalwart health/queue issue detected:', JSON.stringify({ checkedAt: health.checkedAt, healthzStatus: health.healthzStatus, queueVerified: health.queueVerified, inboundProbe: health.inboundProbe, queuedCount: health.queuedCount, stuckCount: health.stuckCount }));
          throw new Error('Stalwart health or queue check failed');
        }
      } else {
        const res = await fetch(`${env.APP_URL}/api/cron/schedule-run`, {
          method: 'POST',
          headers: authHeader,
        });
        console.log(`[revlet-schedule-run fallback] status=${res.status}`);
        if (!res.ok) throw new Error(`revlet-schedule-run fallback failed with HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.error(`[Cron Error] schedule=${cron}:`, err?.message || err);
      throw err;
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/mail-transfer') return handleMailTransfer(request, env);
    const authHeader = {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Cloudflare-Worker-Manual/1.0',
    };

    // 1. Minimal public liveness on /health; detailed Stalwart queue diagnostics require auth
    if (url.pathname === '/health') {
      const detailed = url.searchParams.get('detailed') === '1' || url.searchParams.get('detailed') === 'true';
      if (!detailed) {
        return new Response(
          JSON.stringify({ ok: true, status: 'alive', timestamp: new Date().toISOString() }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (!isAuthorized(request, env)) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const report = await checkStalwartHealthAndQueue(env);
      return new Response(JSON.stringify(report, null, 2), {
        status: report.ok ? 200 : 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Encrypted Nightly Backup Upload -> Cloudflare R2 (revlet-mail-backups)
    if (url.pathname === '/backup/upload' && request.method === 'PUT') {
      if (!env.BACKUP_UPLOAD_SECRET || request.headers.get('Authorization') !== `Bearer ${env.BACKUP_UPLOAD_SECRET}`) {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
      const name = url.searchParams.get('name') || '';
      const sha256 = request.headers.get('x-revlet-sha256')?.toLowerCase() || '';
      if (!/^stalwart-[a-zA-Z0-9._-]{8,150}\.tar\.gz\.enc$/.test(name) ||
          !/^[0-9a-f]{64}$/.test(sha256) || !request.body) {
        return Response.json({ ok: false, error: 'Provide a unique backup name, body, and SHA-256 checksum.' }, { status: 400 });
      }
      const key = `stalwart/${name}`;
      try {
        const stored = await env.BACKUP_BUCKET.put(key, request.body, {
          sha256,
          onlyIf: { etagDoesNotMatch: '*' },
          httpMetadata: { contentType: 'application/octet-stream' },
          customMetadata: { uploadedAt: new Date().toISOString(), sha256 },
        });
        if (!stored) {
          return Response.json({ ok: false, error: 'A backup with that name already exists.' }, { status: 409 });
        }
        return Response.json({ ok: true, key, sizeBytes: stored.size, sha256 }, { status: 201 });
      } catch {
        return Response.json({ ok: false, error: 'Backup checksum or storage validation failed.' }, { status: 422 });
      }
    }

    // 3. List R2 Backups (authenticated)
    if (url.pathname === '/backup/list' && request.method === 'GET') {
      if (!isAuthorized(request, env)) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const cursor = url.searchParams.get('cursor') || undefined;
      const listed = await env.BACKUP_BUCKET.list({ prefix: 'stalwart/', cursor, limit: 100 });
      return new Response(
        JSON.stringify({
          ok: true,
          count: listed.objects.length,
          nextCursor: listed.truncated ? listed.cursor : null,
          backups: listed.objects.map((o) => ({
            key: o.key,
            sizeBytes: o.size,
            uploaded: o.uploaded,
          })),
        }, null, 2),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Manual job trigger (strictly authenticated)
    if (url.pathname === '/run') {
      if (!isAuthorized(request, env)) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const target = url.searchParams.get('job') || 'schedule-run';
      let endpoint = `${env.APP_URL}/api/cron/schedule-run`;
      let method = 'POST';

      if (target === 'quota-reset') {
        endpoint = `${env.APP_URL}/api/mail/v1/quota/reset`;
      } else if (target === 'purge-expired') {
        endpoint = `${env.APP_URL}/api/mail/v1/purge-expired`;
      } else if (target === 'ephemeral-purge') {
        endpoint = `${env.WEBMAIL_URL}/api/cron/ephemeral-purge`;
        method = 'GET';
      }

      const res = await fetch(endpoint, { method, headers: authHeader });
      const data = await res.text();
      return new Response(data, {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        status: 'active',
        service: 'Revlet Cloudflare Cron & Monitor Worker',
        timestamp: new Date().toISOString(),
        endpoints: ['/health', '/run', '/backup/upload', '/backup/list'],
        schedules: [
          { cron: '0 */6 * * *', target: '/api/cron/schedule-run' },
          { cron: '5 0 * * *', target: '/api/mail/v1/quota/reset' },
          { cron: '0 2 * * *', target: '/api/mail/v1/purge-expired' },
          { cron: '*/15 * * * *', target: 'Stalwart Health/Queue Monitor' },
        ],
      }, null, 2),
      { headers: { 'Content-Type': 'application/json' } }
    );
  },
};
