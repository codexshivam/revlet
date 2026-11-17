import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/firebase/admin';
import { sendRevletAccountEmail } from '@/lib/revlet-alerts';

function resolveActionBaseUrl(req: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (configured && configured.startsWith('https://')) {
    return configured;
  }
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'app.revlet.me';
  const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return `${proto}://${host}`;
  }
  return 'https://app.revlet.me';
}

function rewriteFirebaseActionLink(
  rawLink: string,
  baseUrl: string,
  fallbackMode: string,
  continuePath: string
): string {
  try {
    const parsed = new URL(rawLink);
    const mode = parsed.searchParams.get('mode') || fallbackMode;
    const oobCode = parsed.searchParams.get('oobCode') || '';
    const lang = parsed.searchParams.get('lang') || 'en';
    const customUrl = new URL('/auth/action', baseUrl);
    customUrl.searchParams.set('mode', mode);
    customUrl.searchParams.set('oobCode', oobCode);
    customUrl.searchParams.set('continueUrl', `${baseUrl}${continuePath}`);
    customUrl.searchParams.set('lang', lang);
    return customUrl.toString();
  } catch {
    return rawLink;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const type = typeof body.type === 'string' ? body.type : '';
    const baseUrl = resolveActionBaseUrl(req);

    // 1. Password Reset Email (Public, initiated from /login)
    if (type === 'password_reset') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!email || !email.includes('@')) {
        return NextResponse.json(
          { ok: false, error: 'Please provide a valid email address.' },
          { status: 400 }
        );
      }

      const rawLink = await adminAuth.generatePasswordResetLink(email, {
        url: `${baseUrl}/login`,
        handleCodeInApp: false,
      });
      const actionUrl = rewriteFirebaseActionLink(rawLink, baseUrl, 'resetPassword', '/login');

      const sendResult = await sendRevletAccountEmail({
        to: email,
        subject: 'Reset your Revlet account password',
        title: 'Password Reset Request',
        subtitle: `A password reset was requested for your Revlet administrative account (${email}).`,
        summaryLines: [
          'Click the button below to choose a new password for your Revlet account.',
          'For your security, this single-use link expires in 1 hour. If you did not request a password reset, no changes have been made to your account.',
        ],
        ctaLabel: 'Reset Account Password',
        ctaUrl: actionUrl,
        details: [
          { label: 'Account Email', value: email },
          { label: 'Action Type', value: 'Password Reset' },
          { label: 'Portal', value: 'app.revlet.me' },
        ],
      });

      return NextResponse.json(
        sendResult.sent
          ? { ok: true, sent: true }
          : { ok: false, sent: false, error: 'Failed to dispatch password reset email.' },
        { status: sendResult.sent ? 200 : 502 }
      );
    }

    // 1b. Password Updated Confirmation Email (Authenticated via Bearer token, or unauthenticated right after confirmPasswordReset)
    if (type === 'password_updated') {
      const authHeader = req.headers.get('authorization') || '';
      const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
      let targetEmail = '';

      if (idToken) {
        const decoded = await adminAuth.verifyIdToken(idToken);
        targetEmail = (decoded.email || '').trim().toLowerCase();
      } else {
        const requestedEmail =
          typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!requestedEmail || !requestedEmail.includes('@')) {
          return NextResponse.json(
            { ok: false, error: 'Valid account email is required.' },
            { status: 400 }
          );
        }
        const userRecord = await adminAuth.getUserByEmail(requestedEmail);
        const validAfterMs = userRecord.tokensValidAfterTime
          ? Date.parse(userRecord.tokensValidAfterTime)
          : 0;
        if (!validAfterMs || Date.now() - validAfterMs > 5 * 60 * 1000) {
          return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
        }
        targetEmail = (userRecord.email || requestedEmail).trim().toLowerCase();
      }

      if (!targetEmail) {
        return NextResponse.json(
          { ok: false, error: 'Account email is required.' },
          { status: 400 }
        );
      }

      const sendResult = await sendRevletAccountEmail({
        to: targetEmail,
        subject: 'Your Revlet account password was updated',
        title: 'Password Updated',
        subtitle: `The password for your Revlet account (${targetEmail}) on app.revlet.me was recently changed.`,
        summaryLines: [
          'This is a security confirmation that your Revlet account password has been updated.',
          'If you made this change, no further action is needed. If you did not update your password, please reset it immediately or contact support.',
        ],
        ctaLabel: 'Review Account Security',
        ctaUrl: `${baseUrl}/management/settings`,
        regards: 'Regards, Revlet Account Team',
        details: [
          { label: 'Account Email', value: targetEmail },
          { label: 'Portal', value: 'app.revlet.me' },
          { label: 'Action Type', value: 'Password Updated' },
        ],
      });

      return NextResponse.json(
        sendResult.sent
          ? { ok: true, sent: true }
          : { ok: false, sent: false, error: 'Failed to dispatch password updated email.' },
        { status: sendResult.sent ? 200 : 502 }
      );
    }

    // Authenticated actions below require a valid Firebase ID token
    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!idToken) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(idToken);
    const currentEmail = (decoded.email || '').trim().toLowerCase();

    // 2a. Welcome Email on Account Creation
    if (type === 'welcome') {
      const targetEmail =
        currentEmail ||
        (typeof body.email === 'string' && body.email.includes('@')
          ? body.email.trim().toLowerCase()
          : '');
      if (!targetEmail) {
        return NextResponse.json(
          { ok: false, error: 'Account email is required.' },
          { status: 400 }
        );
      }

      const displayName =
        typeof body.displayName === 'string' && body.displayName.trim()
          ? body.displayName.trim()
          : (typeof decoded.name === 'string' && decoded.name.trim()) || targetEmail;

      const sendResult = await sendRevletAccountEmail({
        to: targetEmail,
        subject: 'Welcome to Revlet (app.revlet.me)',
        title: 'Welcome to Revlet',
        subtitle: `Your Revlet administrative account (${targetEmail}) has been created on app.revlet.me.`,
        summaryLines: [
          `Hi ${displayName},`,
          'Welcome to Revlet! Your account on app.revlet.me is now active. You can register your organization, configure DNS and email routing, and manage team security from your control plane.',
        ],
        ctaLabel: 'Open Revlet Console',
        ctaUrl: `${baseUrl}/account/home`,
        regards: 'Regards, Shivam Yadav',
        details: [
          { label: 'Account Email', value: targetEmail },
          { label: 'Portal', value: 'app.revlet.me' },
          { label: 'Action Type', value: 'Account Created' },
        ],
      });

      return NextResponse.json(
        sendResult.sent
          ? { ok: true, sent: true }
          : { ok: false, sent: false, error: 'Failed to dispatch welcome email.' },
        { status: sendResult.sent ? 200 : 502 }
      );
    }

    // 2. Verify Primary Account Email
    if (type === 'verify_email') {
      const targetEmail =
        typeof body.email === 'string' && body.email.includes('@')
          ? body.email.trim().toLowerCase()
          : currentEmail;
      if (!targetEmail) {
        return NextResponse.json(
          { ok: false, error: 'Account email is required.' },
          { status: 400 }
        );
      }

      const rawLink = await adminAuth.generateEmailVerificationLink(targetEmail, {
        url: `${baseUrl}/account/home`,
        handleCodeInApp: false,
      });
      const actionUrl = rewriteFirebaseActionLink(rawLink, baseUrl, 'verifyEmail', '/account/home');

      const sendResult = await sendRevletAccountEmail({
        to: targetEmail,
        subject: 'Verify your Revlet account email address',
        title: 'Confirm Your Email Address',
        subtitle: 'Complete verification for your Revlet administrative account.',
        summaryLines: [
          `Welcome to Revlet. Please confirm that ${targetEmail} is your primary administrative email address by clicking the button below.`,
        ],
        ctaLabel: 'Verify Email Address',
        ctaUrl: actionUrl,
        details: [
          { label: 'Account Email', value: targetEmail },
          { label: 'Action Type', value: 'Email Verification' },
        ],
      });

      return NextResponse.json(
        sendResult.sent
          ? { ok: true, sent: true }
          : { ok: false, sent: false, error: 'Failed to dispatch password reset email.' },
        { status: sendResult.sent ? 200 : 502 }
      );
    }

    // 3. Verify & Change Primary Administrative Email
    if (type === 'change_email') {
      const newEmail =
        typeof body.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';
      if (!newEmail || !newEmail.includes('@') || !currentEmail) {
        return NextResponse.json(
          { ok: false, error: 'A valid new email address is required.' },
          { status: 400 }
        );
      }

      const rawLink = await adminAuth.generateVerifyAndChangeEmailLink(
        currentEmail,
        newEmail,
        {
          url: `${baseUrl}/management/settings`,
          handleCodeInApp: false,
        }
      );
      const actionUrl = rewriteFirebaseActionLink(
        rawLink,
        baseUrl,
        'verifyAndChangeEmail',
        '/management/settings'
      );

      const sendResult = await sendRevletAccountEmail({
        to: newEmail,
        subject: 'Confirm your new Revlet administrative email',
        title: 'Confirm Email Address Change',
        subtitle: `A request was made to update your Revlet login email from ${currentEmail} to ${newEmail}.`,
        summaryLines: [
          `Click the button below to confirm ownership of ${newEmail} and complete your administrative email update.`,
          'Your current login email will remain active until this link is confirmed.',
        ],
        ctaLabel: 'Confirm New Email Address',
        ctaUrl: actionUrl,
        details: [
          { label: 'Current Email', value: currentEmail },
          { label: 'New Email', value: newEmail },
          { label: 'Action Type', value: 'Email Change Confirmation' },
        ],
      });

      return NextResponse.json(
        sendResult.sent
          ? { ok: true, sent: true }
          : { ok: false, sent: false, error: 'Failed to dispatch password reset email.' },
        { status: sendResult.sent ? 200 : 502 }
      );
    }

    return NextResponse.json(
      { ok: false, error: 'Unsupported auth email action type.' },
      { status: 400 }
    );
  } catch (err: any) {
    const code = err?.errorInfo?.code || err?.code || '';
    if (code === 'auth/user-not-found') {
      return NextResponse.json(
        { ok: false, error: 'No account found with this email address.', code },
        { status: 404 }
      );
    }
    if (code === 'auth/email-already-exists') {
      return NextResponse.json(
        { ok: false, error: 'This email address is already in use by another account.', code },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ok: false, error: 'Could not process authentication email request.', code },
      { status: 400 }
    );
  }
}
