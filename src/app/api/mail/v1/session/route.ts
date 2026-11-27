import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';

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
 * GET /api/mail/v1/session?orgId=<id>&userId=<id>&email=<email>
 * O(1) direct session & mailbox verification keyed by organization ID and user ID.
 * Avoids scanning the organization's full mailUsers, mailGroups, and mailOrgUnits collections.
 */
export async function GET(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orgId = (req.nextUrl.searchParams.get('orgId') || '').trim();
    const userId = (req.nextUrl.searchParams.get('userId') || '').trim();
    const emailParam = (req.nextUrl.searchParams.get('email') || '').toLowerCase().trim();

    if (!orgId || (!userId && !emailParam)) {
      return NextResponse.json(
        { ok: false, error: 'orgId and userId (or email) are required.' },
        { status: 400 }
      );
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const [orgSnap, userSnapDirect, sharedSnap] = await Promise.all([
      orgRef.get(),
      userId ? orgRef.collection('mailUsers').doc(userId).get() : Promise.resolve(null),
      orgRef.collection('mailSharedMailboxes').get(),
    ]);

    if (!orgSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Organization not found.' }, { status: 404 });
    }

    const orgData = orgSnap.data() || {};
    if (orgData.status && String(orgData.status).toLowerCase() === 'suspended') {
      return NextResponse.json({ ok: false, active: false, error: 'Organization is suspended.' }, { status: 403 });
    }
    if (orgData.mailServiceActive !== true) {
      return NextResponse.json(
        { ok: false, active: false, status: 'paused', error: 'Organization Email Service is paused.' },
        { status: 403 }
      );
    }

    let userDoc = userSnapDirect && userSnapDirect.exists ? userSnapDirect : null;
    if (!userDoc && emailParam) {
      const byEmail = await orgRef
        .collection('mailUsers')
        .where('primaryEmail', '==', emailParam)
        .limit(1)
        .get();
      if (!byEmail.empty) {
        userDoc = byEmail.docs[0];
      }
    }

    if (!userDoc || !userDoc.exists) {
      return NextResponse.json({ ok: false, active: false, error: 'Mailbox not found.' }, { status: 404 });
    }

    const d = userDoc.data() || {};
    const status = String(d.status || 'active').toLowerCase();
    if (status !== 'active') {
      return NextResponse.json(
        { ok: false, active: false, status, error: 'Mailbox is suspended or inactive.' },
        { status: 403 }
      );
    }

    const primaryEmail = String(d.primaryEmail || emailParam || '').toLowerCase().trim();
    const aliases: string[] = Array.isArray(d.aliases) ? d.aliases : [];
    const isCatchAllTarget = orgData.mailCatchAllUserId === userDoc.id;

    // Keep current delegation checks on shared-mailbox access
    const sharedMailboxes = sharedSnap.docs
      .map((doc) => {
        const sd = doc.data() || {};
        const delegates = Array.isArray(sd.delegates) ? sd.delegates : [];
        const match = delegates.find(
          (del: any) => String(del?.email || '').toLowerCase().trim() === primaryEmail
        );
        if (!match) return null;
        return {
          id: doc.id,
          displayName: String(sd.displayName || sd.email || ''),
          email: String(sd.email || '').toLowerCase().trim(),
          accessLevel: (match.accessLevel || 'FULL_ACCESS') as
            | 'FULL_ACCESS'
            | 'SEND_AS'
            | 'READ_ONLY',
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      ok: true,
      active: true,
      organization: {
        id: orgSnap.id,
        name: String(orgData.name || ''),
        domain: String(orgData.mailDomain || orgData.domain || '').toLowerCase(),
        mailServiceActive: Boolean(orgData.mailServiceActive),
        enforceMfa: Boolean(orgData.enforceMfa),
      },
      mailbox: {
        id: userDoc.id,
        firstName: String(d.firstName || ''),
        lastName: String(d.lastName || ''),
        displayName: String(d.displayName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || primaryEmail),
        primaryEmail,
        role: String(d.role || 'MEMBER'),
        aliases,
        sharedMailboxes,
        orgUnitPath: String(d.orgUnitPath || '/'),
        status,
        isCatchAllTarget,
        stalwartAccountId: typeof d.stalwartAccountId === 'string' && d.stalwartAccountId.trim()
          ? d.stalwartAccountId.trim()
          : null,
        sessionsRevokedAt:
          Math.max(
            typeof d.sessionsRevokedAt === 'number' ? d.sessionsRevokedAt : 0,
            typeof d.sessionRevokedAt === 'number' ? d.sessionRevokedAt : 0
          ) || null,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to verify session.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/mail/v1/session
 * Persists or invalidates the immutable Stalwart account ID on a verified tenant mailbox document.
 */
export async function PATCH(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.orgId === 'string' ? body.orgId.trim() : '';
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const stalwartAccountId =
      body.stalwartAccountId === null
        ? null
        : typeof body.stalwartAccountId === 'string' && body.stalwartAccountId.trim()
          ? body.stalwartAccountId.trim()
          : undefined;

    if (!orgId || !userId || stalwartAccountId === undefined) {
      return NextResponse.json(
        { ok: false, error: 'orgId, userId, and stalwartAccountId (string | null) are required.' },
        { status: 400 }
      );
    }

    const userRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUsers')
      .doc(userId);

    await userRef.set(
      {
        stalwartAccountId,
        stalwartAccountSyncedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, stalwartAccountId });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to update stalwartAccountId.' },
      { status: 500 }
    );
  }
}
