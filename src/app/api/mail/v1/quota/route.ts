import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
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
    const explicitOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : '';
    const submissionId = typeof body.submissionId === 'string' ? body.submissionId.trim().slice(0, 128) : '';
    const actorUid = typeof body.actorUid === 'string' ? body.actorUid.trim().slice(0, 128) : '';
    const ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail.toLowerCase().trim() : '';
    const recipients = Array.isArray(body.recipients)
      ? Array.from(new Set<string>(body.recipients
          .filter((value: unknown) => typeof value === 'string' && value.length <= 320)
          .map((value: string) => value.toLowerCase().trim()))).slice(0, 100)
      : [];
    if (submissionId && !/^[a-zA-Z0-9_-]{1,128}$/.test(submissionId)) {
      return NextResponse.json({ ok: false, error: 'Invalid submission ID.' }, { status: 400 });
    }
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

    // Resolve organization authoritatively via mailDomainBindings/{domain} first
    let orgId = explicitOrgId || getCachedOrgId(domain);
    if (!orgId) {
      const bindingSnap = await adminDb.collection('mailDomainBindings').doc(domain).get();
      if (bindingSnap.exists && typeof bindingSnap.data()?.orgId === 'string') {
        orgId = bindingSnap.data()!.orgId;
      } else {
        // Legacy fallback: only match an org with active email service on this domain
        const orgSnap = await adminDb
          .collection('organizations')
          .where('domain', '==', domain)
          .where('mailServiceActive', '==', true)
          .limit(2)
          .get();

        if (orgSnap.empty) {
          return NextResponse.json(
            { ok: false, smtpCode: 550, smtpMessage: '550 5.1.8 Sender domain not registered or inactive.' },
            { status: 404 }
          );
        }
        if (orgSnap.size > 1) {
          return NextResponse.json(
            { ok: false, smtpCode: 451, smtpMessage: '451 4.3.0 Ambiguous domain binding.' },
            { status: 409 }
          );
        }
        orgId = orgSnap.docs[0].id;
      }
      domainOrgCache.set(domain, { orgId, expiresAt: Date.now() + CACHE_TTL_MS });
    } else if (explicitOrgId) {
      // Verify explicit orgId owns the domain binding if a binding exists
      const bindingSnap = await adminDb.collection('mailDomainBindings').doc(domain).get();
      if (bindingSnap.exists && bindingSnap.data()?.orgId !== explicitOrgId) {
        return NextResponse.json(
          { ok: false, smtpCode: 553, smtpMessage: '553 5.7.1 Sender domain does not match organization binding.' },
          { status: 403 }
        );
      }
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
        if (!aliasSnap.empty) {
          isAuthorizedSender = true;
        } else {
          const sharedSnap = await orgRef
            .collection('mailSharedMailboxes')
            .where('email', '==', fromEmail)
            .limit(1)
            .get();
          isAuthorizedSender = !sharedSnap.empty;
        }
      }
      senderAuthCache.set(senderCacheKey, {
        authorized: isAuthorizedSender,
        expiresAt: Date.now() + (isAuthorizedSender ? CACHE_TTL_MS : 5_000),
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
      const submissionRef = submissionId
        ? orgRef.collection('mailQuotaSubmissions').doc(submissionId)
        : null;
      const [freshOrgDoc, existingSubmissionSnap] = await Promise.all([
        tx.get(orgRef),
        submissionRef ? tx.get(submissionRef) : Promise.resolve(null),
      ]);
      const d = freshOrgDoc.data() || {};

      // Idempotent reservation: return existing submission state so callers reconcile instead of re-sending
      if (existingSubmissionSnap?.exists) {
        const prev = existingSubmissionSnap.data() || {};
        if (prev.fromEmail !== fromEmail || (prev.actorUid && prev.actorUid !== actorUid) ||
            (prev.ownerEmail && prev.ownerEmail !== ownerEmail) ||
            (Array.isArray(prev.recipients) && prev.recipients.length &&
              (prev.recipients.length !== recipients.length || !recipients.every((email) => prev.recipients.includes(email))))) {
          return { allowed: false, smtpCode: 553, smtpMessage: 'Submission ID is already bound to another message.' };
        }
        return {
          allowed: true,
          idempotentReplay: true,
          submissionRecord: {
            submissionStatus: prev.submissionStatus || 'pending',
            emailId: prev.emailId || null,
            threadId: prev.threadId || null,
            jmapSubmissionId: prev.jmapSubmissionId || null,
            deliveryState: prev.deliveryState || null,
            smtpMessage: prev.smtpMessage || null,
            recipientStatus: Array.isArray(prev.recipientStatus) ? prev.recipientStatus : null,
            failedRecipients: Array.isArray(prev.failedRecipients) ? prev.failedRecipients : null,
            error: prev.error || null,
          },
          dailySent: d.mailDailySent ?? 0,
          monthlySent: d.mailMonthlySent ?? 0,
          dailyLimit: d.mailDailyLimit ?? 100,
          monthlyLimit: d.mailMonthlyLimit ?? 1000,
        };
      }

      if (d.mailOutboundPaused) {
        return {
          allowed: false,
          smtpCode: 451,
          smtpMessage: '451 4.7.1 Outbound mail is paused. Review delivery and complaint rates in Revlet.',
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

      // 2. Calculate Monthly Sent Count for Current UTC Calendar Month independently
      // (never pull last month's rolling 24h sends into a new calendar month).
      const currentMonthKey = now.toISOString().slice(0, 7); // e.g. "2026-11"
      const isNewMonth = Boolean(d.mailMonthlyBucket && d.mailMonthlyBucket !== currentMonthKey);
      const currentMonthlySent = isNewMonth ? 0 : Math.max(0, Number(d.mailMonthlySent ?? 0));

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

      if (submissionRef) {
        tx.set(submissionRef, {
          fromEmail,
          actorUid,
          ownerEmail,
          recipients,
          recipientCount,
          submissionStatus: 'pending',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          expireAt: Timestamp.fromMillis(nowMs + 7 * 24 * 60 * 60 * 1000),
        });
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

export async function GET(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const query = req.nextUrl.searchParams;
  const orgId = query.get('orgId') || '';
  const submissionId = query.get('submissionId') || '';
  const actorUid = query.get('actorUid') || '';
  const ownerEmail = (query.get('ownerEmail') || '').toLowerCase();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(submissionId) || !orgId || orgId.includes('/') || !actorUid || !ownerEmail) {
    return NextResponse.json({ ok: false, error: 'Invalid delivery lookup' }, { status: 400 });
  }
  const snapshot = await adminDb.collection('organizations').doc(orgId)
    .collection('mailQuotaSubmissions').doc(submissionId).get();
  const result = snapshot.data();
  if (!result || result.actorUid !== actorUid || result.ownerEmail !== ownerEmail) {
    return NextResponse.json({ ok: false, error: 'Delivery information unavailable' }, { status: 404 });
  }
  return NextResponse.json({ ok: true,
    deliveryState: result.deliveryState || 'queued',
    providerDeliveryUpdatedAt: result.providerDeliveryUpdatedAt || null,
    recipientStatus: Array.isArray(result.recipientStatus) ? result.recipientStatus : [],
  });
}

/**
 * PATCH /api/mail/v1/quota
 * Persists the final submission outcome for a reserved submissionId so retries
 * return the recorded result instead of sending duplicate emails.
 */
export async function PATCH(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const orgId = typeof body.orgId === 'string' ? body.orgId.trim() : '';
    const submissionId = typeof body.submissionId === 'string' ? body.submissionId.trim().slice(0, 128) : '';
    const submissionStatus = body.submissionStatus === 'submitted' || body.submissionStatus === 'failed'
      ? body.submissionStatus
      : null;
    if (!orgId || !submissionId || !submissionStatus) {
      return NextResponse.json(
        { ok: false, error: 'orgId, submissionId, and valid submissionStatus are required.' },
        { status: 400 }
      );
    }

    const docRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailQuotaSubmissions')
      .doc(submissionId);

    const nowMs = Date.now();
    await adminDb.runTransaction(async (tx) => {
      const record = await tx.get(docRef);
      if (!record.exists) throw new Error('Submission reservation is missing.');
      const hasProviderEvents = Boolean(record.data()?.providerDeliveryUpdatedAt);
      tx.set(docRef,
      {
        submissionStatus,
        ...(typeof body.emailId === 'string' ? { emailId: body.emailId } : {}),
        ...(typeof body.threadId === 'string' ? { threadId: body.threadId } : {}),
        ...(typeof body.jmapSubmissionId === 'string' ? { jmapSubmissionId: body.jmapSubmissionId } : {}),
        ...(!hasProviderEvents && typeof body.deliveryState === 'string' ? { deliveryState: body.deliveryState } : {}),
        ...(typeof body.smtpMessage === 'string' ? { smtpMessage: body.smtpMessage.slice(0, 500) } : {}),
        ...(!hasProviderEvents && Array.isArray(body.recipientStatus) ? { recipientStatus: body.recipientStatus } : {}),
        ...(!hasProviderEvents && Array.isArray(body.failedRecipients) ? { failedRecipients: body.failedRecipients } : {}),
        ...(typeof body.error === 'string' ? { error: body.error.slice(0, 500) } : {}),
        updatedAt: new Date(nowMs).toISOString(),
        expireAt: Timestamp.fromMillis(nowMs + 7 * 24 * 60 * 60 * 1000),
      },
      { merge: true }
    );
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to record submission outcome.' },
      { status: 500 }
    );
  }
}
