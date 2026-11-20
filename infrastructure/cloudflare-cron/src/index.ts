export interface Env {
  CRON_SECRET: string;
  APP_URL: string;
  WEBMAIL_URL: string;
  STALWART_URL: string;
  STALWART_ADMIN_USER?: string;
  STALWART_ADMIN_TOKEN?: string;
  BACKUP_BUCKET: R2Bucket;
  BLOB_BUCKET: R2Bucket;
}

interface StalwartHealthReport {
  ok: boolean;
  checkedAt: string;
  healthzOk: boolean;
  healthzStatus: number;
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
  const baseUrl = (env.STALWART_URL || 'https://mx.revlet.me').replace(/\/+$/, '');

  let healthzOk = false;
  let healthzStatus = 0;
  try {
    const hRes = await fetch(`${baseUrl}/healthz/live`, { method: 'GET' });
    healthzStatus = hRes.status;
    healthzOk = hRes.ok;
  } catch {
    healthzOk = false;
  }

  let queuedCount = 0;
  let stuckCount = 0;
  const failingMessages: StalwartHealthReport['failingMessages'] = [];

  if (env.STALWART_ADMIN_USER && env.STALWART_ADMIN_TOKEN) {
    try {
      const auth = btoa(`${env.STALWART_ADMIN_USER}:${env.STALWART_ADMIN_TOKEN}`);
      const qRes = await fetch(`${baseUrl}/jmap/`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          using: ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'],
          methodCalls: [['x:QueuedMessage/get', { accountId: 'b', ids: null }, 'qm']],
        }),
      });
      if (qRes.ok) {
        const data = (await qRes.json()) as any;
        const list: any[] = data?.methodResponses?.[0]?.[1]?.list || [];
        queuedCount = list.length;
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
    ok: healthzOk && stuckCount === 0,
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
      } else if (cron === '5 0 * * *') {
        const res = await fetch(`${env.APP_URL}/api/mail/v1/quota/reset`, {
          method: 'POST',
          headers: authHeader,
        });
        console.log(`[revlet-quota-reset] status=${res.status}`);
      } else if (cron === '0 2 * * *') {
        const res = await fetch(`${env.APP_URL}/api/mail/v1/purge-expired`, {
          method: 'POST',
          headers: authHeader,
        });
        console.log(`[revlet-purge-expired] status=${res.status}`);
      } else if (cron === '*/15 * * * *') {
        const [purgeRes, health] = await Promise.all([
          fetch(`${env.WEBMAIL_URL}/api/cron/ephemeral-purge`, {
            method: 'GET',
            headers: authHeader,
          }),
          checkStalwartHealthAndQueue(env),
        ]);
        console.log(
          `[revletmail-ephemeral-purge] status=${purgeRes.status} | [stalwart-monitor] ok=${health.ok} queued=${health.queuedCount} stuck=${health.stuckCount}`
        );
        if (!health.ok) {
          console.error('[ALERT] Stalwart health/queue issue detected:', JSON.stringify(health));
        }
      } else {
        const res = await fetch(`${env.APP_URL}/api/cron/schedule-run`, {
          method: 'POST',
          headers: authHeader,
        });
        console.log(`[revlet-schedule-run fallback] status=${res.status}`);
      }
    } catch (err: any) {
      console.error(`[Cron Error] schedule=${cron}:`, err?.message || err);
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const authHeader = {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Cloudflare-Worker-Manual/1.0',
    };

    // 1. Live Stalwart Health & Queue Monitor
    if (url.pathname === '/health') {
      const report = await checkStalwartHealthAndQueue(env);
      return new Response(JSON.stringify(report, null, 2), {
        status: report.ok ? 200 : 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Encrypted Nightly Backup Upload -> Cloudflare R2 (revlet-mail-backups)
    if (url.pathname === '/backup/upload' && request.method === 'PUT') {
      if (!isAuthorized(request, env)) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const rawName = (url.searchParams.get('name') || `stalwart-${Date.now()}.tar.gz.enc`)
        .replace(/[^a-zA-Z0-9._-]/g, '');
      const key = `stalwart/${rawName}`;
      await env.BACKUP_BUCKET.put(key, request.body, {
        httpMetadata: { contentType: 'application/octet-stream' },
        customMetadata: { uploadedAt: new Date().toISOString() },
      });

      // Prune backups older than 30 days
      const listed = await env.BACKUP_BUCKET.list({ prefix: 'stalwart/' });
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      let pruned = 0;
      for (const obj of listed.objects) {
        if (obj.uploaded && obj.uploaded.getTime() < cutoff) {
          await env.BACKUP_BUCKET.delete(obj.key);
          pruned++;
        }
      }

      return new Response(
        JSON.stringify({ ok: true, key, totalBackups: listed.objects.length - pruned, pruned }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. List R2 Backups (authenticated)
    if (url.pathname === '/backup/list' && request.method === 'GET') {
      if (!isAuthorized(request, env)) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const listed = await env.BACKUP_BUCKET.list({ prefix: 'stalwart/' });
      return new Response(
        JSON.stringify({
          ok: true,
          count: listed.objects.length,
          backups: listed.objects.map((o) => ({
            key: o.key,
            sizeBytes: o.size,
            uploaded: o.uploaded,
          })),
        }, null, 2),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Manual job trigger
    if (url.pathname === '/run') {
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
          { cron: '*/15 * * * *', target: '/api/cron/ephemeral-purge + Stalwart Health/Queue Monitor' },
        ],
      }, null, 2),
      { headers: { 'Content-Type': 'application/json' } }
    );
  },
};
