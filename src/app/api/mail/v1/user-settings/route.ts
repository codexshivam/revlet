import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
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

async function resolveOrgAndVerifyUser(orgIdInput: string, emailInput: string) {
  const email = emailInput.toLowerCase().trim();
  if (!email || !email.includes('@')) {
    return { error: 'Valid email is required', status: 400 as const };
  }

  const domain = email.split('@')[1] || '';
  let orgDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  if (orgIdInput) {
    const snap = await adminDb.collection('organizations').doc(orgIdInput).get();
    if (snap.exists) orgDoc = snap;
  }
  if (!orgDoc && domain) {
    const snap = await adminDb
      .collection('organizations')
      .where('domain', '==', domain)
      .limit(1)
      .get();
    if (!snap.empty) orgDoc = snap.docs[0];
  }

  if (!orgDoc || !orgDoc.exists) {
    return { error: 'Organization not found', status: 404 as const };
  }

  // Verify user exists in the organization's mail directory (by primaryEmail, email, or alias) and is not suspended
  let userSnap = await orgDoc.ref
    .collection('mailUsers')
    .where('primaryEmail', '==', email)
    .limit(1)
    .get();

  if (userSnap.empty) {
    userSnap = await orgDoc.ref
      .collection('mailUsers')
      .where('email', '==', email)
      .limit(1)
      .get();
  }

  if (userSnap.empty) {
    userSnap = await orgDoc.ref
      .collection('mailUsers')
      .where('aliases', 'array-contains', email)
      .limit(1)
      .get();
  }

  if (userSnap.empty) {
    return { error: 'Mailbox user not found in organization', status: 403 as const };
  }

  const userData = userSnap.docs[0].data() || {};
  if (userData.status === 'suspended' || userData.deleted === true) {
    return { error: 'Mailbox user is suspended or deleted', status: 403 as const };
  }

  return { orgDoc, email };
}

function getEmailDocId(email: string): string {
  return encodeURIComponent(email.toLowerCase().trim());
}

export async function GET(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orgId = (req.nextUrl.searchParams.get('orgId') || '').trim();
    const emailInput = (req.nextUrl.searchParams.get('email') || '').trim();
    const resolved = await resolveOrgAndVerifyUser(orgId, emailInput);
    if ('error' in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }

    const docRef = resolved.orgDoc.ref
      .collection('mailUserSettings')
      .doc(getEmailDocId(resolved.email));
    const snap = await docRef.get();
    const data = snap.exists ? snap.data() || {} : {};

    return NextResponse.json({
      ok: true,
      settings: data.settings || null,
      sieveRules: Array.isArray(data.sieveRules) ? data.sieveRules : null,
      snippets: Array.isArray(data.snippets) ? data.snippets : null,
      identityOverrides:
        data.identityOverrides && typeof data.identityOverrides === 'object'
          ? data.identityOverrides
          : null,
      updatedAt: data.updatedAt || null,
    });
  } catch (err) {
    console.error('[mail/v1/user-settings GET]', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const orgId = typeof body?.orgId === 'string' ? body.orgId.trim() : '';
    const emailInput = typeof body?.email === 'string' ? body.email.trim() : '';

    const resolved = await resolveOrgAndVerifyUser(orgId, emailInput);
    if ('error' in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }

    const docRef = resolved.orgDoc.ref
      .collection('mailUserSettings')
      .doc(getEmailDocId(resolved.email));
    const existingSnap = await docRef.get();
    const existing = existingSnap.exists ? existingSnap.data() || {} : {};

    const updatePayload: Record<string, unknown> = {
      email: resolved.email,
      orgId: resolved.orgDoc.id,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (body.settings && typeof body.settings === 'object') {
      const prevSettings = (existing.settings && typeof existing.settings === 'object'
        ? existing.settings
        : {}) as Record<string, unknown>;
      const incoming = body.settings as Record<string, unknown>;

      const trustedSenders = Array.isArray(incoming.trustedSenders)
        ? Array.from(
            new Set(
              incoming.trustedSenders
                .filter((s): s is string => typeof s === 'string' && s.includes('@'))
                .map((s) => s.toLowerCase().trim())
            )
          ).slice(0, 500)
        : Array.isArray(prevSettings.trustedSenders)
          ? prevSettings.trustedSenders
          : [];

      const blockedSenders = Array.isArray(incoming.blockedSenders)
        ? Array.from(
            new Set(
              incoming.blockedSenders
                .filter((s): s is string => typeof s === 'string' && s.includes('@'))
                .map((s) => s.toLowerCase().trim())
            )
          ).slice(0, 500)
        : Array.isArray(prevSettings.blockedSenders)
          ? prevSettings.blockedSenders
          : [];

      updatePayload.settings = {
        pageSize:
          typeof incoming.pageSize === 'number' && incoming.pageSize >= 10 && incoming.pageSize <= 200
            ? incoming.pageSize
            : typeof prevSettings.pageSize === 'number'
              ? prevSettings.pageSize
              : 50,
        undoSendSeconds:
          typeof incoming.undoSendSeconds === 'number' &&
          [0, 5, 10, 20, 30].includes(incoming.undoSendSeconds)
            ? incoming.undoSendSeconds
            : typeof prevSettings.undoSendSeconds === 'number'
              ? prevSettings.undoSendSeconds
              : 5,
        defaultReplyMode:
          incoming.defaultReplyMode === 'reply_all'
            ? 'reply_all'
            : prevSettings.defaultReplyMode === 'reply_all'
              ? 'reply_all'
              : 'reply',
        keyboardShortcuts:
          typeof incoming.keyboardShortcuts === 'boolean'
            ? incoming.keyboardShortcuts
            : typeof prevSettings.keyboardShortcuts === 'boolean'
              ? prevSettings.keyboardShortcuts
              : true,
        conversationView:
          typeof incoming.conversationView === 'boolean'
            ? incoming.conversationView
            : typeof prevSettings.conversationView === 'boolean'
              ? prevSettings.conversationView
              : true,
        newestOnTop:
          typeof incoming.newestOnTop === 'boolean'
            ? incoming.newestOnTop
            : typeof prevSettings.newestOnTop === 'boolean'
              ? prevSettings.newestOnTop
              : false,
        desktopNotifications:
          typeof incoming.desktopNotifications === 'boolean'
            ? incoming.desktopNotifications
            : Boolean(prevSettings.desktopNotifications),
        trustedSenders,
        blockedSenders,
      };
    }

    if (Array.isArray(body.sieveRules)) {
      updatePayload.sieveRules = body.sieveRules.slice(0, 100);
    }
    if (Array.isArray(body.snippets)) {
      updatePayload.snippets = body.snippets.slice(0, 100);
    }
    if (body.identityOverrides && typeof body.identityOverrides === 'object') {
      updatePayload.identityOverrides = body.identityOverrides;
      const primaryOverride = (body.identityOverrides as Record<string, any>)[resolved.email];
      if (primaryOverride && typeof primaryOverride.name === 'string' && primaryOverride.name.trim()) {
        const mailUsersSnap = await resolved.orgDoc.ref
          .collection('mailUsers')
          .where('primaryEmail', '==', resolved.email)
          .limit(1)
          .get();
        if (!mailUsersSnap.empty) {
          await mailUsersSnap.docs[0].ref.update({
            displayName: primaryOverride.name.trim(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    await docRef.set(updatePayload, { merge: true });

    const savedSnap = await docRef.get();
    const saved = savedSnap.data() || {};

    return NextResponse.json({
      ok: true,
      settings: saved.settings || null,
      sieveRules: Array.isArray(saved.sieveRules) ? saved.sieveRules : [],
      snippets: Array.isArray(saved.snippets) ? saved.snippets : [],
      identityOverrides: saved.identityOverrides || {},
    });
  } catch (err) {
    console.error('[mail/v1/user-settings PUT]', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
