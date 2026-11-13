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
      const nowMs = now.getTime();
      const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = nowMs - 30 * 24 * 60 * 60 * 1000;

      const currentHourKey = now.toISOString().slice(0, 13); // e.g. "2026-11-13T11"
      const currentDayKey = now.toISOString().slice(0, 10); // e.g. "2026-11-13"

      const dailyLimit = d.mailDailyLimit ?? 100;
      const monthlyLimit = d.mailMonthlyLimit ?? 1000;

      // 1. Calculate 24-hour rolling sent count from hourly buckets
      const existingHourly: Record<string, number> = d.mailHourlyBuckets || {};
      const activeHourly: Record<string, number> = {};
      let rollingDailySent = 0;

      for (const [key, count] of Object.entries(existingHourly)) {
        const bucketTime = new Date(key + ':00:00.000Z').getTime();
        if (!isNaN(bucketTime) && bucketTime >= oneDayAgo) {
          const val = typeof count === 'number' ? count : 0;
          rollingDailySent += val;
          activeHourly[key] = val;
        }
      }

      // If hourly buckets not initialized but legacy dailyBucket was set within last 24h:
      if (Object.keys(existingHourly).length === 0 && d.mailDailyBucket) {
        const legacyTime = new Date(d.mailDailyBucket + 'T00:00:00.000Z').getTime();
        if (!isNaN(legacyTime) && legacyTime >= oneDayAgo) {
          rollingDailySent = d.mailDailySent ?? 0;
        }
      }

      // 2. Calculate 30-day rolling sent count from daily buckets
      const existingDaily: Record<string, number> = d.mailDailyBuckets || {};
      const activeDaily: Record<string, number> = {};
      let rollingMonthlySent = 0;

      for (const [key, count] of Object.entries(existingDaily)) {
        const bucketTime = new Date(key + 'T00:00:00.000Z').getTime();
        if (!isNaN(bucketTime) && bucketTime >= thirtyDaysAgo) {
          const val = typeof count === 'number' ? count : 0;
          rollingMonthlySent += val;
          activeDaily[key] = val;
        }
      }

      // If daily buckets not initialized but legacy monthlyBucket was set within last 30d:
      if (Object.keys(existingDaily).length === 0 && d.mailMonthlyBucket) {
        const legacyTime = new Date(d.mailMonthlyBucket + '-01T00:00:00.000Z').getTime();
        if (!isNaN(legacyTime) && legacyTime >= thirtyDaysAgo) {
          rollingMonthlySent = d.mailMonthlySent ?? 0;
        }
      }

      const projectedDaily = rollingDailySent + recipientCount;
      const projectedMonthly = rollingMonthlySent + recipientCount;

      if (projectedDaily > dailyLimit || projectedMonthly > monthlyLimit) {
        return {
          allowed: false,
          smtpCode: 451,
          smtpMessage: '451 4.7.1 Organization outbound email quota reached.',
          dailySent: rollingDailySent,
          monthlySent: rollingMonthlySent,
          dailyLimit,
          monthlyLimit,
        };
      }

      activeHourly[currentHourKey] = (activeHourly[currentHourKey] || 0) + recipientCount;
      activeDaily[currentDayKey] = (activeDaily[currentDayKey] || 0) + recipientCount;

      tx.update(orgRef, {
        mailHourlyBuckets: activeHourly,
        mailDailyBuckets: activeDaily,
        mailDailySent: projectedDaily,
        mailMonthlySent: projectedMonthly,
        mailDailyBucket: currentDayKey,
        mailMonthlyBucket: currentDayKey.slice(0, 7),
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
