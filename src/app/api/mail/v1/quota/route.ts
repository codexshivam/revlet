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

/**
 * POST /api/mail/v1/quota
 * Atomic Outbound Rate-Limiting & Alias Verification Proxy for AWS SES v2 Relay.
 * Enforces:
 *   1. Organization mailServiceActive check
 *   2. Sender envelope validation (primaryEmail or authorized alias of an active mailbox)
 *   3. Atomic daily (default 100/day) and monthly (default 1,000/month) outbound quota transaction
 *   4. Rejects with `451 4.7.1 Organization outbound email quota reached.` when exceeded
 */
export async function POST(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized: Invalid internal service token.' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const fromEmail = (body.fromEmail || '').toLowerCase().trim();
    const recipientCount = Math.max(1, Math.min(100, Number(body.recipientCount) || 1));

    if (!fromEmail || !fromEmail.includes('@')) {
      return NextResponse.json(
        { ok: false, smtpCode: 553, smtpMessage: '553 5.1.7 Invalid sender address.' },
        { status: 400 }
      );
    }

    const domain = fromEmail.split('@')[1]?.toLowerCase().trim();
    const orgSnap = await adminDb
      .collection('organizations')
      .where('domain', '==', domain)
      .limit(1)
      .get();

    if (orgSnap.empty) {
      return NextResponse.json(
        { ok: false, smtpCode: 550, smtpMessage: '550 5.1.8 Sender domain not registered.' },
        { status: 404 }
      );
    }

    const orgRef = orgSnap.docs[0].ref;
    const usersSnap = await orgRef.collection('mailUsers').get();

    const senderDoc = usersSnap.docs.find((d) => {
      const data = d.data();
      if (data.status !== 'active') return false;
      if ((data.primaryEmail || '').toLowerCase() === fromEmail) return true;
      const aliases: string[] = Array.isArray(data.aliases) ? data.aliases : [];
      return aliases.some((a) => a.toLowerCase() === fromEmail);
    });

    if (!senderDoc) {
      return NextResponse.json(
        {
          ok: false,
          smtpCode: 553,
          smtpMessage: `553 5.7.1 Sender address <${fromEmail}> is not an authorized active identity.`,
        },
        { status: 403 }
      );
    }

    const txResult = await adminDb.runTransaction(async (tx) => {
      const freshOrgDoc = await tx.get(orgRef);
      const d = freshOrgDoc.data() || {};

      if (!d.mailServiceActive) {
        return {
          allowed: false,
          smtpCode: 451,
          smtpMessage: '451 4.7.1 Organization Email Service is paused.',
          dailySent: d.mailDailySent ?? 0,
          monthlySent: d.mailMonthlySent ?? 0,
        };
      }

      const now = new Date();
      const currentDayBucket = now.toISOString().slice(0, 10); // YYYY-MM-DD
      const currentMonthBucket = now.toISOString().slice(0, 7); // YYYY-MM

      const dailyLimit = d.mailDailyLimit ?? 100;
      const monthlyLimit = d.mailMonthlyLimit ?? 1000;

      const baseDailySent = d.mailDailyBucket === currentDayBucket ? (d.mailDailySent ?? 0) : 0;
      const baseMonthlySent =
        d.mailMonthlyBucket === currentMonthBucket ? (d.mailMonthlySent ?? 0) : 0;

      const projectedDaily = baseDailySent + recipientCount;
      const projectedMonthly = baseMonthlySent + recipientCount;

      if (projectedDaily > dailyLimit || projectedMonthly > monthlyLimit) {
        return {
          allowed: false,
          smtpCode: 451,
          smtpMessage: '451 4.7.1 Organization outbound email quota reached.',
          dailySent: baseDailySent,
          monthlySent: baseMonthlySent,
          dailyLimit,
          monthlyLimit,
        };
      }

      tx.update(orgRef, {
        mailDailyBucket: currentDayBucket,
        mailMonthlyBucket: currentMonthBucket,
        mailDailySent: projectedDaily,
        mailMonthlySent: projectedMonthly,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        allowed: true,
        smtpCode: 250,
        smtpMessage: '250 2.0.0 OK Outbound quota verified',
        dailySent: projectedDaily,
        monthlySent: projectedMonthly,
        dailyLimit,
        monthlyLimit,
        sesConfigurationSet: `revlet-ses-cfg-${(d.code || orgRef.id).toLowerCase()}`,
      };
    });

    return NextResponse.json(
      { ok: txResult.allowed, ...txResult },
      { status: txResult.allowed ? 200 : 429 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Quota verification failed.' },
      { status: 500 }
    );
  }
}
