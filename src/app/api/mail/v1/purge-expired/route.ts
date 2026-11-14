import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { purgeExpiredMailData } from '@/app/actions/email-service';

function verifyCronSecret(req: NextRequest): boolean {
  const configuredSecret = (
    process.env.CRON_SECRET ||
    process.env.REVLET_MAIL_INTERNAL_SECRET ||
    ''
  ).trim();
  if (!configuredSecret) return false;

  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) return false;

  try {
    const a = Buffer.from(configuredSecret, 'utf8');
    const b = Buffer.from(bearerToken, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
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
    const result = await purgeExpiredMailData();
    return NextResponse.json({
      ok: true,
      ...result,
      executedAt: new Date().toISOString(),
    });
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
