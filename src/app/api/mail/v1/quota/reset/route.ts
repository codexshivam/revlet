import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from '@/firebase/admin';
import { verifyUserOrgAccess } from '@/app/actions/auth-helper';

function verifyInternalServiceSecret(req: NextRequest): boolean {
  const allowedSecrets = [
    (process.env.REVLET_MAIL_INTERNAL_SECRET || '').trim(),
    (process.env.CRON_SECRET || '').trim(),
    (process.env.MAIL_INTERNAL_API_SECRET || '').trim(),
  ].filter(Boolean);
  if (allowedSecrets.length === 0) return false;

  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) return false;

  const b = Buffer.from(bearerToken, 'utf8');
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
 * POST /api/mail/v1/quota/reset
 * Programmatically resets the 24-hour and 30-day email quotas for an organization.
 * Accepts:
 *   - Bearer internal secret OR user Firebase ID token
 *   - Body: { orgId?: string, domain?: string, fromEmail?: string }
 */
export async function POST(req: NextRequest) {
  const isInternalSecret = verifyInternalServiceSecret(req);
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  let decodedToken: any = null;
  if (!isInternalSecret) {
    if (!bearerToken) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: Missing authentication credentials.' },
        { status: 401 }
      );
    }
    try {
      decodedToken = await adminAuth.verifyIdToken(bearerToken);
      if (!decodedToken?.uid) {
        return NextResponse.json(
          { ok: false, error: 'Unauthorized: Invalid authentication credentials.' },
          { status: 401 }
        );
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: Invalid authentication credentials.' },
        { status: 401 }
      );
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    let orgDocId = (body.orgId || '').trim();

    if (!orgDocId && body.domain) {
      const cleanDomain = String(body.domain).toLowerCase().trim();
      const orgSnap = await adminDb
        .collection('organizations')
        .where('domain', '==', cleanDomain)
        .limit(1)
        .get();
      if (!orgSnap.empty) {
        orgDocId = orgSnap.docs[0].id;
      }
    }

    if (!orgDocId && body.fromEmail && body.fromEmail.includes('@')) {
      const cleanDomain = body.fromEmail.split('@')[1]?.toLowerCase().trim();
      const orgSnap = await adminDb
        .collection('organizations')
        .where('domain', '==', cleanDomain)
        .limit(1)
        .get();
      if (!orgSnap.empty) {
        orgDocId = orgSnap.docs[0].id;
      }
    }

    const requestedScope =
      body.scope === 'daily' || body.scope === 'monthly' || body.scope === 'all'
        ? (body.scope as 'daily' | 'monthly' | 'all')
        : null;

    if (!orgDocId) {
      if (isInternalSecret) {
        const now = new Date();
        const nowMs = now.getTime();
        const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
        const currentDayKey = now.toISOString().slice(0, 10);
        const currentMonthKey = now.toISOString().slice(0, 7);
        const systemScope = requestedScope || 'daily';

        const orgsSnap = await adminDb
          .collection('organizations')
          .where('mailServiceActive', '==', true)
          .get();

        let resetCount = 0;
        let monthlyRolloverCount = 0;
        for (const orgDoc of orgsSnap.docs) {
          const orgData = orgDoc.data() || {};
          const isNewMonth = Boolean(
            orgData.mailMonthlyBucket && orgData.mailMonthlyBucket !== currentMonthKey
          );
          const shouldResetMonthly =
            systemScope === 'all' || systemScope === 'monthly' || isNewMonth;

          const updatePayload: Record<string, any> = {
            mailQuotaLastResetAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          };

          // Prune only expired (>24h) rolling hourly buckets so live 24-hour sends
          // are never erased by a fixed-time daily cron run.
          if (systemScope === 'all' || systemScope === 'daily') {
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
            updatePayload.mailHourlyBuckets = activeHourly;
            updatePayload.mailDailySent = rollingDailySent;
            updatePayload.mailDailyBucket = currentDayKey;
            updatePayload.mailQuotaSentToday = rollingDailySent;
          }

          if (shouldResetMonthly) {
            updatePayload.mailMonthlySent = 0;
            updatePayload.mailDailyBuckets = {};
            updatePayload.mailMonthlyBucket = currentMonthKey;
            monthlyRolloverCount++;
          } else if (!orgData.mailMonthlyBucket) {
            updatePayload.mailMonthlyBucket = currentMonthKey;
          }

          await orgDoc.ref.update(updatePayload);
          resetCount++;
        }

        return NextResponse.json({
          ok: true,
          scope: systemScope,
          message: `Reconciled rolling 24h buckets (${systemScope}) for ${resetCount} organizations (${monthlyRolloverCount} monthly rollovers).`,
          resetCount,
          monthlyRolloverCount,
        });
      }

      return NextResponse.json(
        { ok: false, error: 'Missing organization identifier (orgId, domain, or fromEmail).' },
        { status: 400 }
      );
    }

    // Restrict manual quota adjustments to internal operations secret or platform super-admin
    // (or Organization Owner / Organization Admin, never ordinary Email: Admin).
    if (!isInternalSecret && decodedToken?.admin !== true) {
      try {
        const auth = await verifyUserOrgAccess(bearerToken, orgDocId);
        if (!auth.isOwner && !auth.permissions.includes('Organization Admin')) {
          return NextResponse.json(
            { ok: false, error: 'Forbidden: Organization Owner or Organization Admin permission required to adjust quotas.' },
            { status: 403 }
          );
        }
      } catch (err: any) {
        return NextResponse.json(
          { ok: false, error: err?.message || 'Forbidden: Operations or Organization Admin permission required.' },
          { status: 403 }
        );
      }
    }

    const orgRef = adminDb.collection('organizations').doc(orgDocId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Organization not found.' }, { status: 404 });
    }

    const now = new Date();
    const currentDayKey = now.toISOString().slice(0, 10);
    const currentMonthKey = now.toISOString().slice(0, 7);
    const orgScope = requestedScope || 'all';
    const existingData = orgSnap.data() || {};

    const orgUpdate: Record<string, any> = {
      mailQuotaLastResetAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (orgScope === 'all' || orgScope === 'daily') {
      orgUpdate.mailDailySent = 0;
      orgUpdate.mailHourlyBuckets = {};
      orgUpdate.mailDailyBucket = currentDayKey;
      orgUpdate.mailQuotaSentToday = 0;
    }

    if (orgScope === 'all' || orgScope === 'monthly') {
      orgUpdate.mailMonthlySent = 0;
      orgUpdate.mailDailyBuckets = {};
      orgUpdate.mailMonthlyBucket = currentMonthKey;
    }

    await orgRef.update(orgUpdate);

    return NextResponse.json({
      ok: true,
      scope: orgScope,
      message: `Email quota (${orgScope}) has been successfully reset to 0.`,
      orgId: orgDocId,
      dailySent: orgScope === 'all' || orgScope === 'daily' ? 0 : (existingData.mailDailySent ?? 0),
      monthlySent: orgScope === 'all' || orgScope === 'monthly' ? 0 : (existingData.mailMonthlySent ?? 0),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to reset quota.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
