import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { sendRevletAccountEmail } from '@/lib/revlet-alerts';

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

function getEmailDocId(email: string): string {
  return encodeURIComponent(email.toLowerCase().trim());
}

export async function GET(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orgId = (req.nextUrl.searchParams.get('orgId') || '').trim();
    const email = (req.nextUrl.searchParams.get('email') || '').toLowerCase().trim();
    if (!orgId || !email) {
      return NextResponse.json({ ok: false, error: 'orgId and email are required' }, { status: 400 });
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const [orgSnap, mfaSnap] = await Promise.all([
      orgRef.get(),
      orgRef.collection('mailUserMfa').doc(getEmailDocId(email)).get(),
    ]);

    const enforceMfa = Boolean(orgSnap.exists && orgSnap.data()?.enforceMfa);
    const record = mfaSnap.exists ? mfaSnap.data() || null : null;

    return NextResponse.json({
      ok: true,
      enforceMfa,
      record,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to read MFA record' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.orgId === 'string' ? body.orgId.trim() : '';
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
    const record = body.record && typeof body.record === 'object' ? body.record : null;

    if (!orgId || !email || !record) {
      return NextResponse.json(
        { ok: false, error: 'orgId, email, and record are required' },
        { status: 400 }
      );
    }

    await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUserMfa')
      .doc(getEmailDocId(email))
      .set(
        {
          ...record,
          email,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to persist MFA record' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'send_email_otp') {
      const accountEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const targetEmail =
        typeof body.targetEmail === 'string' ? body.targetEmail.trim().toLowerCase() : '';
      const code = typeof body.code === 'string' ? body.code.trim() : '';

      if (!targetEmail || !targetEmail.includes('@') || !/^\d{6}$/.test(code)) {
        return NextResponse.json(
          { ok: false, error: 'Valid targetEmail and 6-digit code are required' },
          { status: 400 }
        );
      }

      const sendRes = await sendRevletAccountEmail({
        to: targetEmail,
        subject: `${code} is your RevletMail verification code`,
        title: 'Verification Required',
        subtitle: 'Use this 6-digit verification code to verify your recovery email or complete 2-Step Verification in RevletMail.',
        otpCode: code,
        summaryLines: [
          'Enter the 6-digit verification code below in your active RevletMail session.',
          'For your security, this one-time code expires in 10 minutes.',
        ],
        details: [
          ...(accountEmail ? [{ label: 'Mailbox Account', value: accountEmail }] : []),
          { label: 'Recovery Email', value: targetEmail },
        ],
      });

      return NextResponse.json({
        ok: true,
        sent: sendRes.sent,
      });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to dispatch MFA email' },
      { status: 500 }
    );
  }
}
