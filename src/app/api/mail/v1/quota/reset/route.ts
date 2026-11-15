import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from '@/firebase/admin';
import { verifyUserOrgAccess } from '@/app/actions/auth-helper';

function verifyInternalServiceSecret(req: NextRequest): boolean {
  const configuredSecret = (process.env.REVLET_MAIL_INTERNAL_SECRET || '').trim();
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

    if (!orgDocId) {
      return NextResponse.json(
        { ok: false, error: 'Missing organization identifier (orgId, domain, or fromEmail).' },
        { status: 400 }
      );
    }

    if (!isInternalSecret && decodedToken?.admin !== true) {
      try {
        await verifyUserOrgAccess(bearerToken, orgDocId, undefined, ['Email: Admin']);
      } catch (err: any) {
        return NextResponse.json(
          { ok: false, error: err?.message || 'Forbidden: Email Admin permission required.' },
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

    await orgRef.update({
      mailDailySent: 0,
      mailMonthlySent: 0,
      mailHourlyBuckets: {},
      mailDailyBuckets: {},
      mailDailyBucket: currentDayKey,
      mailMonthlyBucket: currentMonthKey,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      message: '24-hour and 30-day email quotas have been successfully reset to 0.',
      orgId: orgDocId,
      dailySent: 0,
      monthlySent: 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to reset quota.' },
      { status: 500 }
    );
  }
}
