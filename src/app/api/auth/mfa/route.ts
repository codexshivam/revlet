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
import {
  resolveExpectedRpId,
  verifyPasskeyAssertion,
  verifyPasskeyRegistration,
} from '@/lib/webauthn-verify';
import {
  checkUserEnforceMfa,
  getEnrolledFactorCounts,
  getPrivateMfaRef,
  readPrivateMfaState,
} from '@/lib/mfa-store';
import { sendRevletAccountEmail } from '@/lib/revlet-alerts';

const MFA_SESSION_COOKIE = 'revlet_mfa_session';

async function sendMfaStatusEmail(params: {
  to: string;
  enabled: boolean;
}): Promise<void> {
  if (!params.to || !params.to.includes('@')) return;
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.revlet.me')
    .trim()
    .replace(/\/$/, '');

  await sendRevletAccountEmail(
    params.enabled
      ? {
          to: params.to,
          subject: '2-Step Verification (MFA) enrolled on your Revlet account',
          title: 'MFA Enrollment Confirmed',
          subtitle: `2-Step Verification (MFA) has been enabled on your Revlet account (${params.to}).`,
          summaryLines: [
            'Your Revlet account on app.revlet.me is now protected with Multi-Factor Authentication (MFA).',
            'If you did not enable 2-Step Verification, please review your security settings immediately.',
          ],
          ctaLabel: 'Manage Security Settings',
          ctaUrl: `${baseUrl}/management/settings`,
          regards: 'Regards, Revlet Account Team',
          details: [
            { label: 'Account Email', value: params.to },
            { label: 'Portal', value: 'app.revlet.me' },
            { label: 'Action Type', value: 'MFA Enrolled' },
          ],
        }
      : {
          to: params.to,
          subject: '2-Step Verification (MFA) disabled on your Revlet account',
          title: 'MFA Disabled',
          subtitle: `All 2-Step Verification (MFA) factors have been removed from your Revlet account (${params.to}).`,
          summaryLines: [
            'All Multi-Factor Authentication (MFA) factors have been removed from your Revlet account on app.revlet.me.',
            'If you did not disable 2-Step Verification, please secure your account and re-enable MFA immediately.',
          ],
          ctaLabel: 'Manage Security Settings',
          ctaUrl: `${baseUrl}/management/settings`,
          regards: 'Regards, Revlet Account Team',
          details: [
            { label: 'Account Email', value: params.to },
            { label: 'Portal', value: 'app.revlet.me' },
            { label: 'Action Type', value: 'MFA Disabled' },
          ],
        }
  );
}

function setMfaSessionCookie(
  req: NextRequest,
  res: NextResponse,
  uid: string,
  email: string,
  method: 'totp' | 'passkey' | 'secondary_email' | 'firebase_mfa'
): NextResponse {
  const isHttps =
    req.nextUrl.protocol === 'https:' ||
    req.headers.get('x-forwarded-proto') === 'https';
  const thirtyDays = 30 * 24 * 3600;
  const sessionToken = createStepUpToken({ uid, email, method }, thirtyDays);
  res.cookies.set({
    name: MFA_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: thirtyDays,
  });
  return res;
}

async function authenticateBearer(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    throw new Error('Unauthorized: Missing credentials.');
  }
  // Revocation-aware token verification
  return await adminAuth.verifyIdToken(idToken, true);
}

function hasValidStepUp(body: any, uid: string): boolean {
  const token = typeof body?.stepUpToken === 'string' ? body.stepUpToken : '';
  return Boolean(verifyStepUpToken(token, uid));
}

export async function GET(req: NextRequest) {
  try {
    const decoded = await authenticateBearer(req);
    const userRef = adminDb.collection('users').doc(decoded.uid);
    const [mfaState, passkeysSnap, enforceMfa] = await Promise.all([
      readPrivateMfaState(decoded.uid),
      userRef.collection('mfaPasskeys').get(),
      checkUserEnforceMfa(decoded.uid),
    ]);

    const passkeys = passkeysSnap.docs.map((d) => ({
      id: d.id,
      label: d.data().label || 'Passkey',
      createdAt: d.data().createdAt || '',
    }));

    const totpEnabled = Boolean(mfaState.totpEnabled && mfaState.totpSecret);
    const secondaryEmailVerified = Boolean(mfaState.secondaryEmailVerified && mfaState.secondaryEmail);
    const hasEnrolledMfa = totpEnabled || passkeys.length > 0 || secondaryEmailVerified;

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
        secondaryEmail: mfaState.secondaryEmail || '',
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
    const privRef = getPrivateMfaRef(uid);
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'totp_setup') {
      const counts = await getEnrolledFactorCounts(uid);
      if (counts.totalFactors > 0 && !hasValidStepUp(body, uid)) {
        return NextResponse.json(
          { ok: false, error: 'MFA_STEP_UP_REQUIRED: Verify an existing MFA factor before modifying authenticator setup.' },
          { status: 403 }
        );
      }
      const secret = generateTotpSecret();
      await privRef.set({ totpPendingSecret: secret }, { merge: true });
      return NextResponse.json({
        ok: true,
        secret,
        otpauthUri: buildOtpAuthUri(email || uid, secret, 'Revlet'),
      });
    }

    if (action === 'totp_enable') {
      const code = typeof body.code === 'string' ? body.code : '';
      const counts = await getEnrolledFactorCounts(uid);
      const pendingSecret = counts.state.totpPendingSecret;
      if (!pendingSecret || !verifyTotpCode(pendingSecret, code)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid 6-digit authenticator code.' },
          { status: 400 }
        );
      }
      const hadEnrolledMfa = counts.totalFactors > 0;
      await privRef.set(
        {
          totpSecret: pendingSecret,
          totpEnabled: true,
          totpPendingSecret: null,
        },
        { merge: true }
      );
      if (!hadEnrolledMfa) {
        try {
          await sendMfaStatusEmail({ to: email, enabled: true });
        } catch (mailErr) {
          console.error('[mfa] Failed to send MFA enrollment email (TOTP):', mailErr);
        }
      }
      return setMfaSessionCookie(req, NextResponse.json({ ok: true }), uid, email, 'totp');
    }

    if (action === 'totp_disable') {
      const code = typeof body.code === 'string' ? body.code : '';
      const [counts, enforceMfa] = await Promise.all([
        getEnrolledFactorCounts(uid),
        checkUserEnforceMfa(uid),
      ]);
      const secret = counts.state.totpSecret;
      // Require either a valid current TOTP code OR fresh step-up proof from an existing factor
      const hasTotpProof = Boolean(secret && code && verifyTotpCode(secret, code));
      if (!hasTotpProof && !hasValidStepUp(body, uid)) {
        return NextResponse.json(
          { ok: false, error: 'MFA_STEP_UP_REQUIRED: Verify an existing MFA factor before disabling authenticator.' },
          { status: 403 }
        );
      }
      if (enforceMfa && counts.totalFactors <= 1) {
        return NextResponse.json(
          { ok: false, error: 'Your organization enforces 2-Step Verification. Enroll another factor before removing your last one.' },
          { status: 403 }
        );
      }
      await privRef.set({ totpEnabled: false, totpSecret: null }, { merge: true });
      const after = await getEnrolledFactorCounts(uid);
      if (counts.totalFactors > 0 && after.totalFactors === 0) {
        try {
          await sendMfaStatusEmail({ to: email, enabled: false });
        } catch (mailErr) {
          console.error('[mfa] Failed to send MFA disabled email (TOTP):', mailErr);
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'passkey_register_options') {
      const counts = await getEnrolledFactorCounts(uid);
      if (counts.totalFactors > 0 && !hasValidStepUp(body, uid)) {
        return NextResponse.json(
          { ok: false, error: 'MFA_STEP_UP_REQUIRED: Verify an existing MFA factor before registering a new passkey.' },
          { status: 403 }
        );
      }
      const challenge = crypto.randomBytes(32).toString('base64url');
      await userRef.collection('mfaChallenges').doc('current').set({
        challenge,
        type: 'create',
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      const rpId = resolveExpectedRpId(req);
      return NextResponse.json({
        ok: true,
        challenge,
        rp: { name: 'Revlet', id: rpId },
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
      const publicKeySpki = typeof body.publicKeySpki === 'string' ? body.publicKeySpki : '';
      const publicKeyAlgorithm = typeof body.publicKeyAlgorithm === 'number' ? body.publicKeyAlgorithm : 0;
      const authenticatorData = typeof body.authenticatorData === 'string' ? body.authenticatorData : undefined;
      const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : 'Security Passkey';

      if (!credentialId || !clientDataJSON || !publicKeySpki) {
        return NextResponse.json({ ok: false, error: 'Invalid passkey payload.' }, { status: 400 });
      }
      const counts = await getEnrolledFactorCounts(uid);
      const chRef = userRef.collection('mfaChallenges').doc('current');
      const pkRef = userRef.collection('mfaPasskeys').doc(credentialId);

      // Atomically consume registration challenge and persist credential
      await adminDb.runTransaction(async (tx) => {
        const chSnap = await tx.get(chRef);
        const chData = chSnap.data();
        if (!chData || chData.type !== 'create' || chData.expiresAt < Date.now()) {
          throw new Error('CHALLENGE_EXPIRED');
        }
        const regCheck = verifyPasskeyRegistration({
          req,
          expectedChallenge: chData.challenge,
          credentialId,
          clientDataJSON,
          publicKeySpki,
          publicKeyAlgorithm,
          authenticatorData,
        });
        if (!regCheck.ok) {
          throw new Error(`VERIFY_FAILED:${regCheck.error}`);
        }
        tx.delete(chRef);
        tx.set(pkRef, {
          credentialId,
          label,
          publicKeySpki,
          publicKeyAlgorithm,
          signCount: regCheck.signCount,
          createdAt: new Date().toISOString(),
        });
      });

      if (counts.totalFactors === 0) {
        try {
          await sendMfaStatusEmail({ to: email, enabled: true });
        } catch (mailErr) {
          console.error('[mfa] Failed to send MFA enrollment email (Passkey):', mailErr);
        }
      }
      return setMfaSessionCookie(req, NextResponse.json({ ok: true }), uid, email, 'passkey');
    }

    if (action === 'passkey_remove') {
      const credentialId = typeof body.credentialId === 'string' ? body.credentialId : '';
      if (!credentialId) {
        return NextResponse.json({ ok: false, error: 'credentialId required.' }, { status: 400 });
      }
      if (!hasValidStepUp(body, uid)) {
        return NextResponse.json(
          { ok: false, error: 'MFA_STEP_UP_REQUIRED: Verify an existing MFA factor before removing a passkey.' },
          { status: 403 }
        );
      }
      const [counts, enforceMfa] = await Promise.all([
        getEnrolledFactorCounts(uid),
        checkUserEnforceMfa(uid),
      ]);
      if (enforceMfa && counts.totalFactors <= 1) {
        return NextResponse.json(
          { ok: false, error: 'Your organization enforces 2-Step Verification. Enroll another factor before removing your last one.' },
          { status: 403 }
        );
      }
      await userRef.collection('mfaPasskeys').doc(credentialId).delete();
      const after = await getEnrolledFactorCounts(uid);
      if (counts.totalFactors > 0 && after.totalFactors === 0) {
        try {
          await sendMfaStatusEmail({ to: email, enabled: false });
        } catch (mailErr) {
          console.error('[mfa] Failed to send MFA disabled email (Passkey):', mailErr);
        }
      }
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
        rpId: resolveExpectedRpId(req),
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
      const counts = await getEnrolledFactorCounts(uid);
      const savedEmail = counts.state.secondaryEmail || '';
      const isChangingRecoveryEmail = Boolean(targetEmail && targetEmail !== savedEmail);
      if (isChangingRecoveryEmail && counts.totalFactors > 0 && !hasValidStepUp(body, uid)) {
        return NextResponse.json(
          { ok: false, error: 'MFA_STEP_UP_REQUIRED: Verify an existing MFA factor before changing your recovery email.' },
          { status: 403 }
        );
      }
      const sendTo = targetEmail || savedEmail;
      if (!sendTo || !sendTo.includes('@')) {
        return NextResponse.json(
          { ok: false, error: 'Valid secondary email address is required.' },
          { status: 400 }
        );
      }

      const code = String(crypto.randomInt(100000, 999999));
      await privRef.set(
        {
          ...(isChangingRecoveryEmail
            ? { secondaryEmail: targetEmail, secondaryEmailVerified: false }
            : {}),
          secondaryOtpHash: hashOtpCode(uid, code),
          secondaryOtpExpiresAt: Date.now() + 10 * 60 * 1000,
        },
        { merge: true }
      );

      await sendRevletAccountEmail({
        to: sendTo,
        subject: `${code} is your Revlet verification code`,
        title: 'Verification Required',
        subtitle: 'Use this 6-digit verification code to verify your recovery email or complete 2-Step Verification.',
        otpCode: code,
        summaryLines: [
          'Enter the 6-digit verification code below in your active Revlet session.',
          'For your security, this one-time code expires in 10 minutes.',
        ],
        details: [
          { label: 'Account', value: email || uid },
          { label: 'Recovery Email', value: sendTo },
        ],
      });

      return NextResponse.json({ ok: true, sentTo: sendTo });
    }

    if (action === 'secondary_email_verify') {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const counts = await getEnrolledFactorCounts(uid);
      const data = counts.state;
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
      const wasAlreadyVerified = Boolean(data.secondaryEmailVerified);
      const hadEnrolledMfa = counts.totalFactors > 0;
      await privRef.set(
        {
          secondaryEmailVerified: true,
          secondaryOtpHash: null,
          secondaryOtpExpiresAt: null,
        },
        { merge: true }
      );
      if (!hadEnrolledMfa) {
        try {
          await sendMfaStatusEmail({
            to: email || data.secondaryEmail || '',
            enabled: true,
          });
        } catch (mailErr) {
          console.error('[mfa] Failed to send MFA enrollment email (Secondary Email):', mailErr);
        }
      }
      // Do NOT mint stepUpToken when newly confirming a recovery address if other MFA factors existed
      if (!wasAlreadyVerified && hadEnrolledMfa) {
        return NextResponse.json({ ok: true });
      }
      const stepUpToken = createStepUpToken({ uid, email, method: 'secondary_email' });
      return setMfaSessionCookie(
        req,
        NextResponse.json({ ok: true, stepUpToken, expiresInSeconds: 600 }),
        uid,
        email,
        'secondary_email'
      );
    }

    if (action === 'step_up_verify') {
      const method = body.method as 'totp' | 'passkey' | 'secondary_email' | 'firebase_mfa';
      const u = await readPrivateMfaState(uid);

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
          req,
          NextResponse.json({ ok: true, stepUpToken, expiresInSeconds: 600 }),
          uid,
          email,
          'totp'
        );
      }

      if (method === 'passkey') {
        const credentialId = typeof body.credentialId === 'string' ? body.credentialId : '';
        const clientDataJSON = typeof body.clientDataJSON === 'string' ? body.clientDataJSON : '';
        const authenticatorData = typeof body.authenticatorData === 'string' ? body.authenticatorData : '';
        const signature = typeof body.signature === 'string' ? body.signature : '';

        const chRef = userRef.collection('mfaChallenges').doc('current');
        const pkRef = userRef.collection('mfaPasskeys').doc(credentialId);

        // Atomic challenge consumption + monotonic signCount update; never swallow write errors
        await adminDb.runTransaction(async (tx) => {
          const [chSnap, pkSnap] = await Promise.all([tx.get(chRef), tx.get(pkRef)]);
          const chData = chSnap.data();
          if (!chData || chData.type !== 'get' || chData.expiresAt < Date.now()) {
            throw new Error('CHALLENGE_EXPIRED');
          }
          if (!pkSnap.exists) {
            throw new Error('UNKNOWN_PASSKEY');
          }
          const pkData = pkSnap.data() || {};
          const assertCheck = verifyPasskeyAssertion({
            req,
            expectedChallenge: chData.challenge,
            passkey: {
              id: pkSnap.id,
              label: pkData.label || 'Passkey',
              createdAt: pkData.createdAt || '',
              publicKeySpki: pkData.publicKeySpki,
              publicKeyAlgorithm: pkData.publicKeyAlgorithm,
              signCount: pkData.signCount,
            },
            clientDataJSON,
            authenticatorData,
            signature,
          });
          if (!assertCheck.ok) {
            throw new Error(`VERIFY_FAILED:${assertCheck.error}`);
          }
          tx.delete(chRef);
          tx.set(pkRef, { signCount: assertCheck.nextSignCount }, { merge: true });
        });

        const stepUpToken = createStepUpToken({ uid, email, method: 'passkey' });
        return setMfaSessionCookie(
          req,
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
        await privRef.set({ secondaryOtpHash: null, secondaryOtpExpiresAt: null }, { merge: true });
        const stepUpToken = createStepUpToken({ uid, email, method: 'secondary_email' });
        return setMfaSessionCookie(
          req,
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
            { ok: false, error: 'Second factor verification is not active in this session.' },
            { status: 400 }
          );
        }
        const stepUpToken = createStepUpToken({ uid, email, method: 'firebase_mfa' });
        return setMfaSessionCookie(
          req,
          NextResponse.json({ ok: true, stepUpToken, expiresInSeconds: 600 }),
          uid,
          email,
          'firebase_mfa'
        );
      }

      return NextResponse.json({ ok: false, error: 'Unsupported verification method.' }, { status: 400 });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg === 'CHALLENGE_EXPIRED') {
      return NextResponse.json({ ok: false, error: 'Passkey challenge expired.' }, { status: 400 });
    }
    if (msg === 'UNKNOWN_PASSKEY') {
      return NextResponse.json({ ok: false, error: 'Unrecognized passkey credential.' }, { status: 403 });
    }
    if (msg.startsWith('VERIFY_FAILED:')) {
      return NextResponse.json({ ok: false, error: msg.slice('VERIFY_FAILED:'.length) }, { status: 403 });
    }
    if (msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('revoked')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { ok: false, error: 'Verification request could not be completed.' },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(MFA_SESSION_COOKIE);
  res.cookies.delete('revlet_session_hint');
  res.cookies.delete('revlet_last_org');
  return res;
}
