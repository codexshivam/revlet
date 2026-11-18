export interface Env {
  CRON_SECRET: string;
  APP_URL: string;
  WEBMAIL_URL: string;
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
        const res = await fetch(`${env.WEBMAIL_URL}/api/cron/ephemeral-purge`, {
          method: 'GET',
          headers: authHeader,
        });
        console.log(`[revletmail-ephemeral-purge] status=${res.status}`);
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
        service: 'Revlet Cloudflare Cron Worker',
        timestamp: new Date().toISOString(),
        schedules: [
          { cron: '0 */6 * * *', target: '/api/cron/schedule-run' },
          { cron: '5 0 * * *', target: '/api/mail/v1/quota/reset' },
          { cron: '0 2 * * *', target: '/api/mail/v1/purge-expired' },
          { cron: '*/15 * * * *', target: '/api/cron/ephemeral-purge' },
        ],
      }, null, 2),
      { headers: { 'Content-Type': 'application/json' } }
    );
  },
};
