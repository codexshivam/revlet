import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { purgeExpiredMailData } from '@/lib/mail-internal';
import { reconcileEphemeralMail } from '@/lib/mail-ephemeral-retention';

function verifyCronSecret(req: NextRequest): boolean {
  const token = Buffer.from((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim());
  if (!token.length) return false;
  return [process.env.CRON_SECRET, process.env.REVLET_MAIL_INTERNAL_SECRET].some((secret) => {
    const expected = Buffer.from((secret || '').trim());
    return expected.length === token.length && crypto.timingSafeEqual(token, expected);
  });
}

/**
 * POST /api/mail/v1/purge-expired
 * Scheduled retention-enforcement endpoint (run daily via Cloud Scheduler / cron).
 * Deletes all email accounts & deactivated org mail data past their 14-day retention window
 * and notifies organization owners from alerts@revlet.me.
 */
export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized: Invalid cron or internal secret.' },
      { status: 401 }
    );
  }

  try {
    const ephemeralOnly = req.nextUrl.searchParams.get('mode') === 'ephemeral';
    const result = ephemeralOnly ? {} : await purgeExpiredMailData();
    const ephemeral = await reconcileEphemeralMail();
    const ok = ephemeral.failedMailboxes === 0;
    return NextResponse.json({
      ok,
      ...result,
      ephemeral,
      executedAt: new Date().toISOString(),
    }, { status: ok ? 200 : 503 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to purge expired mail data.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
