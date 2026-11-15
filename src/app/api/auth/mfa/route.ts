import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase/admin';
import {
  buildOtpAuthUri,
  createStepUpToken,
  generateTotpSecret,
  hashOtpCode,
  verifyStepUpToken,
  verifyTotpCode,
} from '@/lib/mfa';
import { sendRevletAlertEmail } from '@/lib/revlet-alerts';

const MFA_SESSION_COOKIE = 'revlet_mfa_session';

function setMfaSessionCookie(
  res: NextResponse,
  uid: string,
  email: string,
  method: 'totp' | 'passkey' | 'secondary_email' | 'firebase_mfa'
): NextResponse {
  const sessionToken = createStepUpToken({ uid, email, method }, 7 * 24 * 3600);
  res.cookies.set({
    name: MFA_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  });
  return res;
}

async function authenticateBearer(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    throw new Error('Unauthorized: Missing Firebase ID token.');
  }
  const decoded = await adminAuth.verifyIdToken(idToken);
  return decoded;
}

export async function GET(req: NextRequest) {
  try {
    const decoded = await authenticateBearer(req);
    const userRef = adminDb.collection('users').doc(decoded.uid);
    const [userSnap, passkeysSnap] = await Promise.all([
      userRef.get(),
      userRef.collection('mfaPasskeys').get(),
    ]);
    const u = userSnap.exists ? userSnap.data() || {} : {};
    const passkeys = passkeysSnap.docs.map((d) => ({
      id: d.id,
      label: d.data().label || 'Passkey',
      createdAt: d.data().createdAt || '',
    }));

    const totpEnabled = Boolean(u.totpEnabled && u.totpSecret);
    const secondaryEmailVerified = Boolean(u.secondaryEmailVerified && u.secondaryEmail);
    const hasEnrolledMfa = totpEnabled || passkeys.length > 0 || secondaryEmailVerified;

    let enforceMfa = false;
    try {
      const orgsSnap = await adminDb
        .collection('organizations')
        .where('memberIds', 'array-contains', decoded.uid)
        .get();
      enforceMfa = orgsSnap.docs.some((d) => Boolean(d.data()?.enforceMfa));
      if (!enforceMfa) {
        const ownedSnap = await adminDb
          .collection('organizations')
          .where('ownerId', '==', decoded.uid)
          .get();
        enforceMfa = ownedSnap.docs.some((d) => Boolean(d.data()?.enforceMfa));
      }
    } catch {
      enforceMfa = false;
    }

    const mfaCookie = req.cookies.get(MFA_SESSION_COOKIE)?.value;
    const mfaSessionVerified = Boolean(verifyStepUpToken(mfaCookie, decoded.uid));

    return NextResponse.json({
      ok: true,
      hasEnrolledMfa,
      enforceMfa,
      mfaSessionVerified,
      mfa: {
        totpEnabled,
        passkeys,
        secondaryEmail: u.secondaryEmail || '',
        secondaryEmailVerified,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const decoded = await authenticateBearer(req);
    const uid = decoded.uid;
    const email = (decoded.email || '').toLowerCase();
    const userRef = adminDb.collection('users').doc(uid);
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'totp_setup') {
      const secret = generateTotpSecret();
      await userRef.set({ totpPendingSecret: secret }, { merge: true });
      return NextResponse.json({
        ok: true,
        secret,
        otpauthUri: buildOtpAuthUri(email || uid, secret, 'Revlet'),
      });
    }

    if (action === 'totp_enable') {
      const code = typeof body.code === 'string' ? body.code : '';
      const snap = await userRef.get();
      const pendingSecret = snap.data()?.totpPendingSecret;
      if (!pendingSecret || !verifyTotpCode(pendingSecret, code)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid 6-digit authenticator code.' },
          { status: 400 }
        );
      }
      await userRef.set(
        {
          totpSecret: pendingSecret,
          totpEnabled: true,
          totpPendingSecret: null,
        },
        { merge: true }
      );
      return setMfaSessionCookie(NextResponse.json({ ok: true }), uid, email, 'totp');
    }

    if (action === 'totp_disable') {
      const code = typeof body.code === 'string' ? body.code : '';
      const snap = await userRef.get();
      const secret = snap.data()?.totpSecret;
      if (secret && !verifyTotpCode(secret, code)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid authenticator code.' },
          { status: 400 }
        );
      }
      await userRef.set({ totpEnabled: false, totpSecret: null }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (action === 'passkey_register_options') {
      const challenge = crypto.randomBytes(32).toString('base64url');
      await userRef.collection('mfaChallenges').doc('current').set({
        challenge,
        type: 'create',
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      const host = req.nextUrl.hostname || 'app.revlet.me';
      return NextResponse.json({
        ok: true,
        challenge,
        rp: { name: 'Revlet', id: host === '127.0.0.1' ? 'localhost' : host },
        user: {
          id: Buffer.from(uid, 'utf8').toString('base64url'),
          name: email || uid,
          displayName: decoded.name || email || 'Revlet User',
        },
      });
    }

    if (action === 'passkey_register_verify') {
      const credentialId = typeof body.credentialId === 'string' ? body.credentialId : '';
      const clientDataJSON = typeof body.clientDataJSON === 'string' ? body.clientDataJSON : '';
      const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : 'Security Passkey';

      if (!credentialId || !clientDataJSON) {
        return NextResponse.json({ ok: false, error: 'Invalid passkey payload.' }, { status: 400 });
      }
      const chSnap = await userRef.collection('mfaChallenges').doc('current').get();
      const chData = chSnap.data();
      if (!chData || chData.type !== 'create' || chData.expiresAt < Date.now()) {
        return NextResponse.json({ ok: false, error: 'Passkey challenge expired.' }, { status: 400 });
      }
      const clientData = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
      if (clientData.type !== 'webauthn.create' || clientData.challenge !== chData.challenge) {
        return NextResponse.json({ ok: false, error: 'Passkey challenge mismatch.' }, { status: 400 });
      }
      await userRef.collection('mfaChallenges').doc('current').delete().catch(() => {});
      await userRef.collection('mfaPasskeys').doc(credentialId).set({
        credentialId,
        label,
        createdAt: new Date().toISOString(),
      });
      return setMfaSessionCookie(NextResponse.json({ ok: true }), uid, email, 'passkey');
    }

    if (action === 'passkey_remove') {
      const credentialId = typeof body.credentialId === 'string' ? body.credentialId : '';
      if (!credentialId) {
        return NextResponse.json({ ok: false, error: 'credentialId required.' }, { status: 400 });
      }
      await userRef.collection('mfaPasskeys').doc(credentialId).delete();
      return NextResponse.json({ ok: true });
    }

    if (action === 'passkey_assert_options') {
      const passkeysSnap = await userRef.collection('mfaPasskeys').get();
      if (passkeysSnap.empty) {
        return NextResponse.json(
          { ok: false, error: 'No passkeys registered on this account.' },
          { status: 400 }
        );
      }
      const challenge = crypto.randomBytes(32).toString('base64url');
      await userRef.collection('mfaChallenges').doc('current').set({
        challenge,
        type: 'get',
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      return NextResponse.json({
        ok: true,
        challenge,
        allowCredentials: passkeysSnap.docs.map((d) => ({
          id: d.id,
          type: 'public-key',
        })),
      });
    }

    if (action === 'secondary_email_send') {
      const targetEmail =
        typeof body.secondaryEmail === 'string' && body.secondaryEmail.includes('@')
          ? body.secondaryEmail.trim().toLowerCase()
          : '';
      const snap = await userRef.get();
      const savedEmail = snap.data()?.secondaryEmail || '';
      const sendTo = targetEmail || savedEmail;
      if (!sendTo || !sendTo.includes('@')) {
        return NextResponse.json(
          { ok: false, error: 'Valid secondary email address is required.' },
          { status: 400 }
        );
      }

      const code = String(crypto.randomInt(100000, 999999));
      await userRef.set(
        {
          ...(targetEmail && targetEmail !== savedEmail
            ? { secondaryEmail: targetEmail, secondaryEmailVerified: false }
            : {}),
          secondaryOtpHash: hashOtpCode(uid, code),
          secondaryOtpExpiresAt: Date.now() + 10 * 60 * 1000,
        },
        { merge: true }
      );

      await sendRevletAlertEmail({
        to: sendTo,
        subject: 'Your Revlet Security Verification Code',
        title: 'Step-Up MFA Verification Code',
        subtitle: 'Use this one-time code to verify your secondary recovery email.',
        summaryLines: [
          `Verification Code: ${code}`,
          'This code expires in 10 minutes.',
        ],
        details: [
          { label: 'Account', value: email || uid },
          { label: 'Verification Code', value: code },
        ],
      });

      return NextResponse.json({ ok: true, sentTo: sendTo });
    }

    if (action === 'secondary_email_verify') {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const snap = await userRef.get();
      const data = snap.data() || {};
      if (
        !data.secondaryOtpHash ||
        !data.secondaryOtpExpiresAt ||
        data.secondaryOtpExpiresAt < Date.now()
      ) {
        return NextResponse.json(
          { ok: false, error: 'Verification code expired. Please request a new one.' },
          { status: 400 }
        );
      }
      if (hashOtpCode(uid, code) !== data.secondaryOtpHash) {
        return NextResponse.json(
          { ok: false, error: 'Invalid 6-digit email verification code.' },
          { status: 400 }
        );
      }
      await userRef.set(
        {
          secondaryEmailVerified: true,
          secondaryOtpHash: null,
          secondaryOtpExpiresAt: null,
        },
        { merge: true }
      );
      const stepUpToken = createStepUpToken({ uid, email, method: 'secondary_email' });
      return setMfaSessionCookie(
        NextResponse.json({ ok: true, stepUpToken, expiresInSeconds: 600 }),
        uid,
        email,
        'secondary_email'
      );
    }

    if (action === 'step_up_verify') {
      const method = body.method as 'totp' | 'passkey' | 'secondary_email' | 'firebase_mfa';
      const snap = await userRef.get();
      const u = snap.data() || {};

      if (method === 'totp') {
        const code = typeof body.code === 'string' ? body.code : '';
        if (!u.totpEnabled || !u.totpSecret) {
          return NextResponse.json(
            { ok: false, error: 'Authenticator App is not enrolled on this account.' },
            { status: 400 }
          );
        }
        if (!verifyTotpCode(u.totpSecret, code)) {
          return NextResponse.json({ ok: false, error: 'Invalid authenticator code.' }, { status: 400 });
        }
        const stepUpToken = createStepUpToken({ uid, email, method: 'totp' });
        return setMfaSessionCookie(
          NextResponse.json({ ok: true, stepUpToken, expiresInSeconds: 600 }),
          uid,
          email,
          'totp'
        );
      }

      if (method === 'passkey') {
        const credentialId = typeof body.credentialId === 'string' ? body.credentialId : '';
        const clientDataJSON = typeof body.clientDataJSON === 'string' ? body.clientDataJSON : '';
        const chSnap = await userRef.collection('mfaChallenges').doc('current').get();
        const chData = chSnap.data();
        if (!chData || chData.type !== 'get' || chData.expiresAt < Date.now()) {
          return NextResponse.json({ ok: false, error: 'Passkey challenge expired.' }, { status: 400 });
        }
        const pkSnap = await userRef.collection('mfaPasskeys').doc(credentialId).get();
        if (!pkSnap.exists) {
          return NextResponse.json({ ok: false, error: 'Unrecognized passkey credential.' }, { status: 403 });
        }
        const clientData = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
        if (clientData.type !== 'webauthn.get' || clientData.challenge !== chData.challenge) {
          return NextResponse.json({ ok: false, error: 'Passkey assertion mismatch.' }, { status: 400 });
        }
        await userRef.collection('mfaChallenges').doc('current').delete().catch(() => {});
        const stepUpToken = createStepUpToken({ uid, email, method: 'passkey' });
        return setMfaSessionCookie(
          NextResponse.json({ ok: true, stepUpToken, expiresInSeconds: 600 }),
          uid,
          email,
          'passkey'
        );
      }

      if (method === 'secondary_email') {
        const code = typeof body.code === 'string' ? body.code.trim() : '';
        if (!u.secondaryEmailVerified) {
          return NextResponse.json(
            { ok: false, error: 'Secondary email is not verified.' },
            { status: 400 }
          );
        }
        if (
          !u.secondaryOtpHash ||
          !u.secondaryOtpExpiresAt ||
          u.secondaryOtpExpiresAt < Date.now() ||
          hashOtpCode(uid, code) !== u.secondaryOtpHash
        ) {
          return NextResponse.json({ ok: false, error: 'Invalid or expired email code.' }, { status: 400 });
        }
        await userRef.set({ secondaryOtpHash: null, secondaryOtpExpiresAt: null }, { merge: true });
        const stepUpToken = createStepUpToken({ uid, email, method: 'secondary_email' });
        return setMfaSessionCookie(
          NextResponse.json({ ok: true, stepUpToken, expiresInSeconds: 600 }),
          uid,
          email,
          'secondary_email'
        );
      }

      if (method === 'firebase_mfa') {
        const secondFactor = (decoded as any).firebase?.sign_in_second_factor;
        if (!secondFactor) {
          return NextResponse.json(
            { ok: false, error: 'Firebase Auth second factor is not present in this ID token.' },
            { status: 400 }
          );
        }
        const stepUpToken = createStepUpToken({ uid, email, method: 'firebase_mfa' });
        return setMfaSessionCookie(
          NextResponse.json({ ok: true, stepUpToken, expiresInSeconds: 600 }),
          uid,
          email,
          'firebase_mfa'
        );
      }

      return NextResponse.json({ ok: false, error: 'Unsupported MFA method.' }, { status: 400 });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'MFA request failed.' },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(MFA_SESSION_COOKIE);
  return res;
}
