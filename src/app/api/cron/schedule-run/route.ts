import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { purgeExpiredMailData } from '@/lib/mail-internal';

export const dynamic = 'force-dynamic';

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const allowedSecrets = [
    (process.env.CRON_SECRET || '').trim(),
    (process.env.REVLET_MAIL_INTERNAL_SECRET || '').trim(),
    (process.env.MAIL_INTERNAL_API_SECRET || '').trim(),
  ].filter(Boolean);
  if (allowedSecrets.length === 0) return false;

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : request.headers.get('x-cron-secret')?.trim();

  if (!token) return false;

  const b = Buffer.from(token, 'utf8');
  for (const sec of allowedSecrets) {
    try {
      const a = Buffer.from(sec, 'utf8');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    } catch {
      // Continue checking next secret
    }
  }
  return false;
}

/**
 * Unified Google Cloud Scheduler / Cloud Run Scheduled Task Handler
 * Runs:
 * 1. Nightly 30-day expired organization mail data purge
 * 2. Daily outbound sender & domain quota reset
 * 3. Webmail ephemeral state purge (forwards to mail.revlet.me/api/cron/ephemeral-purge)
 */
async function executeScheduledRun(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized scheduler invocation' }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const results: Record<string, unknown> = {};
  let hasFailure = false;

  // 1. Purge expired organization mail data
  try {
    results.purgeExpired = await purgeExpiredMailData();
  } catch (err: any) {
    hasFailure = true;
    results.purgeExpired = { error: err?.message || 'Purge failed' };
  }

  // 2. Reconcile expired (>24h) rolling quota buckets & monthly rollovers without erasing live 24h sends
  try {
    const forceQuotaReset = request.nextUrl.searchParams.get('forceQuotaReset') === 'true';
    const now = new Date();
    const nowMs = now.getTime();
    const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
    const todayUtc = now.toISOString().slice(0, 10);
    const currentMonthKey = now.toISOString().slice(0, 7);
    const stateRef = adminDb.collection('system').doc('schedulerState');
    const stateSnap = await stateRef.get();
    const lastQuotaResetDay = stateSnap.data()?.lastQuotaResetDay;

    if (forceQuotaReset || lastQuotaResetDay !== todayUtc) {
      let reconciledOrgsCount = 0;
      let monthlyRolloverCount = 0;
      const orgsSnap = await adminDb
        .collection('organizations')
        .where('mailServiceActive', '==', true)
        .get();

      for (const orgDoc of orgsSnap.docs) {
        const rolled = await adminDb.runTransaction(async (tx) => {
          const freshSnap = await tx.get(orgDoc.ref);
          if (!freshSnap.exists) return false;
          const orgData = freshSnap.data() || {};
          const existingHourly: Record<string, number> = orgData.mailHourlyBuckets || {};
          const activeHourly: Record<string, number> = {};
          let rollingDailySent = 0;
          for (const [key, count] of Object.entries(existingHourly)) {
            const bucketTime = new Date(key + ':00:00.000Z').getTime();
            if (!isNaN(bucketTime) && bucketTime >= oneDayAgo) {
              const val = typeof count === 'number' ? count : 0;
              activeHourly[key] = val;
              rollingDailySent += val;
            }
          }

          const isNewMonth = Boolean(
            orgData.mailMonthlyBucket && orgData.mailMonthlyBucket !== currentMonthKey
          );
          const updatePayload: Record<string, unknown> = {
            mailHourlyBuckets: activeHourly,
            mailDailySent: rollingDailySent,
            mailQuotaSentToday: rollingDailySent,
            mailDailyBucket: todayUtc,
            mailQuotaLastResetAt: FieldValue.serverTimestamp(),
          };
          if (isNewMonth) {
            updatePayload.mailMonthlySent = 0;
            updatePayload.mailDailyBuckets = {};
            updatePayload.mailMonthlyBucket = currentMonthKey;
          } else if (!orgData.mailMonthlyBucket) {
            updatePayload.mailMonthlyBucket = currentMonthKey;
          }

          tx.set(orgDoc.ref, updatePayload, { merge: true });
          return isNewMonth;
        });
        if (rolled) monthlyRolloverCount++;
        reconciledOrgsCount++;
      }

      await stateRef.set(
        {
          lastQuotaResetDay: todayUtc,
          lastQuotaResetAt: FieldValue.serverTimestamp(),
          lastRunAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      results.quotaReset = {
        executed: true,
        day: todayUtc,
        reconciledOrgsCount,
        monthlyRolloverCount,
      };
    } else {
      results.quotaReset = {
        executed: false,
        reason: `Already reconciled for ${todayUtc}`,
      };
    }
  } catch (err: any) {
    hasFailure = true;
    results.quotaReset = { error: err?.message || 'Quota reconciliation failed' };
  }

  const webmailUrl = (process.env.NEXT_PUBLIC_WEBMAIL_URL || 'https://mail.revlet.me').replace(/\/$/, '');
  const cronSecret = process.env.CRON_SECRET || process.env.MAIL_INTERNAL_API_SECRET || '';

  // 4. Dispatch due Scheduled Send messages via RevletMail (runs independently of any open browser)
  try {
    const schedRes = await fetch(`${webmailUrl}/api/cron/dispatch-scheduled`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret || (process.env.REVLET_MAIL_INTERNAL_SECRET || '').trim()}`,
      },
      signal: AbortSignal.timeout(15000),
    });
    const schedBody = await schedRes.json().catch(() => ({}));
    if (!schedRes.ok) {
      hasFailure = true;
    }
    results.scheduledMailDispatch = {
      status: schedRes.status,
      ok: schedRes.ok,
      ...schedBody,
    };
  } catch (err: any) {
    hasFailure = true;
    results.scheduledMailDispatch = {
      ok: false,
      reason: err?.message || 'Scheduled dispatch unreachable',
    };
  }

  return NextResponse.json(
    {
      success: !hasFailure,
      startedAt,
      completedAt: new Date().toISOString(),
      results,
    },
    { status: hasFailure ? 500 : 200 }
  );
}

export async function GET(request: NextRequest) {
  return executeScheduledRun(request);
}

export async function POST(request: NextRequest) {
  return executeScheduledRun(request);
}
