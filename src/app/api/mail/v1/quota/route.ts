import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';

// Short-TTL in-memory caches to cut Firestore reads by ~80% on outbound mail bursts
const CACHE_TTL_MS = 60_000;
const domainOrgCache = new Map<string, { orgId: string; expiresAt: number }>();
const senderAuthCache = new Map<string, { authorized: boolean; expiresAt: number }>();

function getCachedOrgId(domain: string): string | null {
  const entry = domainOrgCache.get(domain);
  if (entry && entry.expiresAt > Date.now()) return entry.orgId;
  domainOrgCache.delete(domain);
  return null;
}

function getCachedSenderAuth(key: string): boolean | null {
  const entry = senderAuthCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.authorized;
  senderAuthCache.delete(key);
  return null;
}

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
    if (!domain) {
      return NextResponse.json(
        { ok: false, smtpCode: 553, smtpMessage: '553 5.1.7 Invalid sender domain.' },
        { status: 400 }
      );
    }

    let orgId = getCachedOrgId(domain);
    if (!orgId) {
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
      orgId = orgSnap.docs[0].id;
      domainOrgCache.set(domain, { orgId, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const senderCacheKey = `${orgId}:${fromEmail}`;
    let isAuthorizedSender = getCachedSenderAuth(senderCacheKey);

    if (isAuthorizedSender === null) {
      // Targeted 1-read lookup instead of scanning all mailUsers docs
      const primarySnap = await orgRef
        .collection('mailUsers')
        .where('primaryEmail', '==', fromEmail)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (!primarySnap.empty) {
        isAuthorizedSender = true;
      } else {
        const aliasSnap = await orgRef
          .collection('mailUsers')
          .where('aliases', 'array-contains', fromEmail)
          .where('status', '==', 'active')
          .limit(1)
          .get();
        isAuthorizedSender = !aliasSnap.empty;
      }
      senderAuthCache.set(senderCacheKey, {
        authorized: isAuthorizedSender,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }

    if (!isAuthorizedSender) {
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

      if (d.mailOutboundPaused || (typeof d.mailBounceRate === 'number' && d.mailBounceRate > 5.0)) {
        return {
          allowed: false,
          smtpCode: 451,
          smtpMessage: '451 4.7.1 Outbound mail auto-paused: bounce rate exceeded 5.0% safety threshold.',
          dailySent: d.mailDailySent ?? 0,
          monthlySent: d.mailMonthlySent ?? 0,
        };
      }

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

      // 2. Calculate Monthly Sent Count for Current Calendar Month
      const currentMonthKey = now.toISOString().slice(0, 7); // e.g. "2026-11"
      const isNewMonth = d.mailMonthlyBucket && d.mailMonthlyBucket !== currentMonthKey;
      let currentMonthlySent = 0;

      if (!isNewMonth) {
        const recordedMonthly = d.mailMonthlySent ?? 0;
        currentMonthlySent = Math.max(recordedMonthly, rollingDailySent);
      }

      const projectedDaily = rollingDailySent + recipientCount;
      const projectedMonthly = currentMonthlySent + recipientCount;

      if (projectedDaily > dailyLimit || projectedMonthly > monthlyLimit) {
        return {
          allowed: false,
          smtpCode: 451,
          smtpMessage: '451 4.7.1 Organization outbound email quota reached.',
          dailySent: rollingDailySent,
          monthlySent: currentMonthlySent,
          dailyLimit,
          monthlyLimit,
        };
      }

      // 3. Keep 30-day daily buckets for analytics/auditing
      const existingDaily: Record<string, number> = d.mailDailyBuckets || {};
      const activeDaily: Record<string, number> = {};
      for (const [key, count] of Object.entries(existingDaily)) {
        const bucketTime = new Date(key + 'T00:00:00.000Z').getTime();
        if (!isNaN(bucketTime) && bucketTime >= thirtyDaysAgo) {
          activeDaily[key] = typeof count === 'number' ? count : 0;
        }
      }

      activeHourly[currentHourKey] = (activeHourly[currentHourKey] || 0) + recipientCount;
      activeDaily[currentDayKey] = (activeDaily[currentDayKey] || 0) + recipientCount;

      tx.update(orgRef, {
        mailHourlyBuckets: activeHourly,
        mailDailyBuckets: activeDaily,
        mailDailySent: projectedDaily,
        mailMonthlySent: projectedMonthly,
        mailDailyBucket: currentDayKey,
        mailMonthlyBucket: currentMonthKey,
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
