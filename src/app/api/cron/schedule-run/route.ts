import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { purgeExpiredMailData } from '@/lib/mail-internal';

export const dynamic = 'force-dynamic';

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET || process.env.MAIL_INTERNAL_API_SECRET || '';
  if (!cronSecret) return false;

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : request.headers.get('x-cron-secret')?.trim();

  return Boolean(token && token === cronSecret);
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

  // 1. Purge expired organization mail data
  try {
    results.purgeExpired = await purgeExpiredMailData();
  } catch (err: any) {
    results.purgeExpired = { error: err?.message || 'Purge failed' };
  }

  // 2. Reset daily outbound quotas if needed (runs once per UTC day or when ?forceQuotaReset=true)
  try {
    const forceQuotaReset = request.nextUrl.searchParams.get('forceQuotaReset') === 'true';
    const todayUtc = new Date().toISOString().slice(0, 10);
    const stateRef = adminDb.collection('system').doc('schedulerState');
    const stateSnap = await stateRef.get();
    const lastQuotaResetDay = stateSnap.data()?.lastQuotaResetDay;

    if (forceQuotaReset || lastQuotaResetDay !== todayUtc) {
      let resetOrgsCount = 0;
      let resetUsersCount = 0;
      const orgsSnap = await adminDb
        .collection('organizations')
        .where('mailServiceActive', '==', true)
        .get();

      for (const orgDoc of orgsSnap.docs) {
        await orgDoc.ref.set(
          {
            mailQuotaSentToday: 0,
            mailQuotaLastResetAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        resetOrgsCount++;

        const usersSnap = await orgDoc.ref.collection('mailUsers').get();
        if (!usersSnap.empty) {
          const batch = adminDb.batch();
          for (const userDoc of usersSnap.docs) {
            batch.set(
              userDoc.ref,
              {
                sentTodayCount: 0,
                quotaLastResetAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
            resetUsersCount++;
          }
          await batch.commit();
        }
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
        resetOrgsCount,
        resetUsersCount,
      };
    } else {
      results.quotaReset = {
        executed: false,
        reason: `Already reset for ${todayUtc}`,
      };
    }
  } catch (err: any) {
    results.quotaReset = { error: err?.message || 'Quota reset failed' };
  }

  // 3. Trigger RevletMail ephemeral purge if configured
  const webmailUrl = (process.env.NEXT_PUBLIC_WEBMAIL_URL || 'https://mail.revlet.me').replace(/\/$/, '');
  const cronSecret = process.env.CRON_SECRET || process.env.MAIL_INTERNAL_API_SECRET || '';
  try {
    const res = await fetch(`${webmailUrl}/api/cron/ephemeral-purge`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    results.webmailEphemeralPurge = {
      status: res.status,
      ok: res.ok,
    };
  } catch (err: any) {
    results.webmailEphemeralPurge = {
      skipped: true,
      reason: err?.message || 'Webmail unreachable',
    };
  }

  return NextResponse.json({
    success: true,
    startedAt,
    completedAt: new Date().toISOString(),
    results,
  });
}

export async function GET(request: NextRequest) {
  return executeScheduledRun(request);
}

export async function POST(request: NextRequest) {
  return executeScheduledRun(request);
}
