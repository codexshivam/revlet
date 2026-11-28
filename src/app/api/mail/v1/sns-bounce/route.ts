import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import {
  resolveOrganizationOwnerEmail,
  sendRevletAlertEmail,
  sendRevletMailerDaemonEmail,
} from '@/lib/revlet-alerts';

const snsCertCache = new Map<string, string>();

const AWS_SNS_HOSTS = new Map<string, string>([
  ['sns.us-east-1.amazonaws.com', 'https://sns.us-east-1.amazonaws.com'],
  ['sns.us-east-2.amazonaws.com', 'https://sns.us-east-2.amazonaws.com'],
  ['sns.us-west-1.amazonaws.com', 'https://sns.us-west-1.amazonaws.com'],
  ['sns.us-west-2.amazonaws.com', 'https://sns.us-west-2.amazonaws.com'],
  ['sns.af-south-1.amazonaws.com', 'https://sns.af-south-1.amazonaws.com'],
  ['sns.ap-east-1.amazonaws.com', 'https://sns.ap-east-1.amazonaws.com'],
  ['sns.ap-south-1.amazonaws.com', 'https://sns.ap-south-1.amazonaws.com'],
  ['sns.ap-south-2.amazonaws.com', 'https://sns.ap-south-2.amazonaws.com'],
  ['sns.ap-southeast-1.amazonaws.com', 'https://sns.ap-southeast-1.amazonaws.com'],
  ['sns.ap-southeast-2.amazonaws.com', 'https://sns.ap-southeast-2.amazonaws.com'],
  ['sns.ap-southeast-3.amazonaws.com', 'https://sns.ap-southeast-3.amazonaws.com'],
  ['sns.ap-northeast-1.amazonaws.com', 'https://sns.ap-northeast-1.amazonaws.com'],
  ['sns.ap-northeast-2.amazonaws.com', 'https://sns.ap-northeast-2.amazonaws.com'],
  ['sns.ap-northeast-3.amazonaws.com', 'https://sns.ap-northeast-3.amazonaws.com'],
  ['sns.ca-central-1.amazonaws.com', 'https://sns.ca-central-1.amazonaws.com'],
  ['sns.eu-central-1.amazonaws.com', 'https://sns.eu-central-1.amazonaws.com'],
  ['sns.eu-central-2.amazonaws.com', 'https://sns.eu-central-2.amazonaws.com'],
  ['sns.eu-west-1.amazonaws.com', 'https://sns.eu-west-1.amazonaws.com'],
  ['sns.eu-west-2.amazonaws.com', 'https://sns.eu-west-2.amazonaws.com'],
  ['sns.eu-west-3.amazonaws.com', 'https://sns.eu-west-3.amazonaws.com'],
  ['sns.eu-south-1.amazonaws.com', 'https://sns.eu-south-1.amazonaws.com'],
  ['sns.eu-north-1.amazonaws.com', 'https://sns.eu-north-1.amazonaws.com'],
  ['sns.me-south-1.amazonaws.com', 'https://sns.me-south-1.amazonaws.com'],
  ['sns.me-central-1.amazonaws.com', 'https://sns.me-central-1.amazonaws.com'],
  ['sns.sa-east-1.amazonaws.com', 'https://sns.sa-east-1.amazonaws.com'],
]);

function resolveSafeSnsUrl(rawUrl: string, requirePem: boolean): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.port && parsed.port !== '443') return null;
    const safeOrigin = AWS_SNS_HOSTS.get(parsed.hostname.toLowerCase());
    if (!safeOrigin) return null;

    if (requirePem) {
      // Strictly allow only top-level .pem certificate filenames on official SNS regional hosts
      const match = /^\/([A-Za-z0-9._-]+\.pem)$/.exec(parsed.pathname);
      if (!match || match[1].includes('..')) return null;
      return `${safeOrigin}/${encodeURIComponent(match[1])}`;
    }

    // Strictly reconstruct SubscribeURL from validated query parameters only
    const action = parsed.searchParams.get('Action');
    const topicArn = parsed.searchParams.get('TopicArn');
    const token = parsed.searchParams.get('Token');
    if (action !== 'ConfirmSubscription' || !topicArn || !token) return null;
    if (!/^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]+$/.test(topicArn)) return null;
    if (!/^[A-Za-z0-9+/=_-]+$/.test(token)) return null;
    const params = new URLSearchParams({
      Action: 'ConfirmSubscription',
      TopicArn: topicArn,
      Token: token,
    });
    return `${safeOrigin}/?${params.toString()}`;
  } catch {
    return null;
  }
}

function buildSnsStringToSign(msg: Record<string, any>): string {
  const type = msg.Type;
  const fields =
    type === 'Notification'
      ? msg.Subject
        ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
        : ['Message', 'MessageId', 'Timestamp', 'TopicArn', 'Type']
      : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];

  let canonical = '';
  for (const field of fields) {
    if (typeof msg[field] === 'string') {
      canonical += `${field}\n${msg[field]}\n`;
    }
  }
  return canonical;
}

async function verifyAwsSnsSignature(msg: Record<string, any>): Promise<boolean> {
  if (
    !msg ||
    typeof msg.Type !== 'string' ||
    typeof msg.Signature !== 'string' ||
    typeof msg.SigningCertURL !== 'string'
  ) {
    return false;
  }

  const safeCertUrl = resolveSafeSnsUrl(msg.SigningCertURL, true);
  if (!safeCertUrl) {
    return false;
  }

  const sigVersion = String(msg.SignatureVersion || '1');
  if (sigVersion !== '1' && sigVersion !== '2') {
    return false;
  }

  let pem = snsCertCache.get(safeCertUrl);
  if (!pem) {
    const certRes = await fetch(safeCertUrl, { method: 'GET', cache: 'force-cache' });
    if (!certRes.ok) return false;
    pem = await certRes.text();
    if (!pem.includes('BEGIN CERTIFICATE')) return false;
    if (snsCertCache.size > 50) snsCertCache.clear();
    snsCertCache.set(safeCertUrl, pem);
  }

  const algorithm = sigVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  const verifier = crypto.createVerify(algorithm);
  verifier.update(buildSnsStringToSign(msg), 'utf8');
  return verifier.verify(pem, msg.Signature, 'base64');
}

/**
 * POST /api/mail/v1/sns-bounce
 * AWS SNS Bounce & Complaint Webhook Receiver.
 * Verifies AWS SNS cryptographic signatures, confirms SNS subscriptions, and tracks domain-level
 * bounce/complaint rates, auto-pausing outbound mail (`mailOutboundPaused = true`) if bounce rate exceeds 5.0%.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody || '{}');

    const signatureValid = await verifyAwsSnsSignature(body);
    if (!signatureValid) {
      return NextResponse.json({ ok: false, error: 'Invalid or missing AWS SNS signature' }, { status: 403 });
    }

    // Enforce strict TopicArn allowlist (fail closed if unconfigured or mismatched)
    const allowedTopics = (process.env.AWS_SNS_BOUNCE_TOPIC_ARNS || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const incomingTopicArn = typeof body.TopicArn === 'string' ? body.TopicArn.trim() : '';
    if (allowedTopics.length === 0 || !incomingTopicArn || !allowedTopics.includes(incomingTopicArn)) {
      return NextResponse.json({ ok: false, error: 'Forbidden: Untrusted or unconfigured SNS TopicArn' }, { status: 403 });
    }

    // 1. Handle AWS SNS SubscriptionConfirmation automatically (strictly allowlisted SNS regional host)
    if (body.Type === 'SubscriptionConfirmation' && typeof body.SubscribeURL === 'string') {
      const safeSubUrl = resolveSafeSnsUrl(body.SubscribeURL, false);
      if (!safeSubUrl) {
        return NextResponse.json({ ok: false, error: 'Invalid SubscribeURL' }, { status: 400 });
      }
      await fetch(safeSubUrl, { method: 'GET', cache: 'no-store' });
      return NextResponse.json({ ok: true, confirmed: true });
    }

    // 2. Parse SNS Notification envelope or direct SES event payload
    let sesEvent = body;
    if (body.Type === 'Notification' && typeof body.Message === 'string') {
      try {
        sesEvent = JSON.parse(body.Message);
      } catch {
        return NextResponse.json({ ok: false, error: 'Invalid SNS Message JSON' }, { status: 400 });
      }
    }

    const notificationType = sesEvent.notificationType || sesEvent.eventType;
    if (!['Bounce', 'Complaint', 'Delivery', 'DeliveryDelay', 'Reject', 'Send'].includes(notificationType)) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const sourceEmail: string = (sesEvent.mail?.source || sesEvent.fromEmail || '').toLowerCase().trim();
    const domain = sourceEmail.includes('@') ? sourceEmail.split('@')[1] : '';
    if (!domain) {
      return NextResponse.json({ ok: false, error: 'Missing source domain' }, { status: 400 });
    }

    // Resolve organization authoritatively via mailDomainBindings/{domain} first
    let orgRef: FirebaseFirestore.DocumentReference | null = null;
    const bindingSnap = await adminDb.collection('mailDomainBindings').doc(domain).get();
    if (bindingSnap.exists && typeof bindingSnap.data()?.orgId === 'string') {
      orgRef = adminDb.collection('organizations').doc(bindingSnap.data()!.orgId);
    } else {
      const orgSnap = await adminDb
        .collection('organizations')
        .where('domain', '==', domain)
        .where('mailServiceActive', '==', true)
        .limit(2)
        .get();
      if (orgSnap.size === 1) orgRef = orgSnap.docs[0].ref;
    }

    if (!orgRef) {
      return NextResponse.json({ ok: true, skipped: 'Domain not registered' });
    }
    const isBounce = notificationType === 'Bounce';
    const isComplaint = notificationType === 'Complaint';
    const isPermanentBounce = isBounce && sesEvent.bounce?.bounceType === 'Permanent';
    const addresses = (values: unknown): string[] => Array.isArray(values)
      ? Array.from(new Set(values.map((item) =>
          (typeof item === 'string' ? item : String(item?.emailAddress || '')).toLowerCase().trim()
        ).filter((email) => email.includes('@') && email.length <= 320))).slice(0, 100)
      : [];
    const affected = addresses(
      isBounce ? sesEvent.bounce?.bouncedRecipients :
      isComplaint ? sesEvent.complaint?.complainedRecipients :
      notificationType === 'Delivery' ? sesEvent.delivery?.recipients :
      notificationType === 'DeliveryDelay' ? sesEvent.deliveryDelay?.delayedRecipients :
      sesEvent.mail?.destination
    );
    const statsBounce = isPermanentBounce && !['Suppressed', 'OnAccountSuppressionList', 'OnTenantSuppressionList', 'UnsubscribedRecipient', 'EmailValidationSuppressed'].includes(sesEvent.bounce?.bounceSubType);
    const eventTimestamp = Date.parse(String(sesEvent.mail?.timestamp || ''));
    const submissionHeader = Array.isArray(sesEvent.mail?.headers)
      ? sesEvent.mail.headers.find((header: { name?: string }) => header.name?.toLowerCase() === 'x-revlet-submission')?.value
      : undefined;
    const signed = typeof submissionHeader === 'string' ? submissionHeader.match(/^([a-zA-Z0-9_-]{1,128})\.([a-f0-9]{64})$/) : null;
    const correlationSecret = process.env.REVLET_MAIL_INTERNAL_SECRET?.trim();
    const expectedSignature = signed && correlationSecret
      ? crypto.createHmac('sha256', correlationSecret).update(`ses:${orgRef.id}:${signed[1]}`).digest()
      : null;
    const submissionRef = signed && expectedSignature && crypto.timingSafeEqual(expectedSignature, Buffer.from(signed[2], 'hex'))
      ? orgRef.collection('mailQuotaSubmissions').doc(signed[1])
      : null;

    const messageId = typeof body.MessageId === 'string' ? body.MessageId.trim() : '';
    if (body.Type === 'Notification' && !messageId) {
      return NextResponse.json({ ok: false, error: 'Missing SNS MessageId' }, { status: 400 });
    }
    const dedupDocId = messageId
      ? crypto.createHash('sha256').update(messageId).digest('hex')
      : '';
    const dedupRef = dedupDocId ? orgRef.collection('snsProcessedEvents').doc(dedupDocId) : null;

    const result = await adminDb.runTransaction(async (tx) => {
      if (dedupRef) {
        const dedupSnap = await tx.get(dedupRef);
        if (dedupSnap.exists) {
          return { duplicate: true, autoPaused: false, wasAlreadyPaused: true, orgData: {} } as any;
        }
      }

      const snap = await tx.get(orgRef);
      const d = snap.data() || {};

      const submission = submissionRef ? (await tx.get(submissionRef)).data() : undefined;
      const currentMonthKey = new Date().toISOString().slice(0, 7);
      const sameMonth = d.mailBounceBucket === currentMonthKey;
      const inCurrentCohort = Number.isFinite(eventTimestamp) &&
        new Date(eventTimestamp).toISOString().slice(0, 7) === currentMonthKey;
      const hasStats = inCurrentCohort && affected.length > 0 && (statsBounce || isComplaint);
      const bounces = (sameMonth ? d.mailBounceCount ?? 0 : 0) + (hasStats && statsBounce ? affected.length : 0);
      const complaints = (sameMonth ? d.mailComplaintCount ?? 0 : 0) + (hasStats && isComplaint ? affected.length : 0);
      const sentBaseline = Math.max(20, d.mailMonthlyBucket === currentMonthKey ? d.mailMonthlySent ?? 0 : 0);
      const bounceRate = Number(((bounces / sentBaseline) * 100).toFixed(2));
      const complaintRate = Number(((complaints / sentBaseline) * 100).toFixed(2));
      const shouldAutoPause = hasStats && ((bounces >= 5 && bounceRate > 5.0) || (complaints >= 2 && complaintRate > 0.1));
      const wasAlreadyPaused = Boolean(d.mailOutboundPaused);
      if (hasStats) {
        tx.update(orgRef, {
          mailBounceCount: bounces, mailComplaintCount: complaints, mailBounceBucket: currentMonthKey,
          mailBounceRate: bounceRate, mailComplaintRate: complaintRate,
          ...(shouldAutoPause ? { mailOutboundPaused: true } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (submissionRef && submission && affected.length && Array.isArray(submission.recipients) && !isComplaint) {
        const eventRecipients = new Set(affected);
        const old = new Map<string, any>(
          Array.isArray(submission.recipientStatus) ? submission.recipientStatus.map((entry: any) => [entry.email, entry]) : [],
        );
        const state = notificationType === 'Delivery' ? 'delivered'
          : isBounce || notificationType === 'Reject' ? 'failed' : 'queued';
        const update = submission.recipients.map((email: string) => {
          const current = old.get(email) || { email, state: 'queued' };
          if (!eventRecipients.has(email) || (state === 'queued' && current.state !== 'queued') ||
              (state === 'delivered' && current.state === 'failed' && current.providerEvent)) return current;
          return { email, state, providerEvent: notificationType };
        });
        const failedRecipients = update.filter((entry: any) => entry.state === 'failed');
        const deliveryState = failedRecipients.length === update.length ? 'failed'
          : failedRecipients.length ? 'partial'
          : update.every((entry: any) => entry.state === 'delivered') ? 'delivered' : 'queued';
        tx.update(submissionRef, {
          recipientStatus: update, failedRecipients, deliveryState,
          providerDeliveryUpdatedAt: new Date().toISOString(),
        });
      }

      if (dedupRef) {
        tx.set(dedupRef, {
          messageId,
          notificationType,
          processedAt: FieldValue.serverTimestamp(),
        });
      }

      return {
        duplicate: false,
        domain,
        bounces,
        complaints,
        bounceRate,
        complaintRate,
        autoPaused: shouldAutoPause,
        wasAlreadyPaused,
        orgData: d,
      };
    });

    if (result.duplicate) {
      return NextResponse.json({ ok: true, deduplicated: true });
    }

    if (
      isPermanentBounce &&
      sourceEmail &&
      sourceEmail !== 'mailer-daemon@revlet.me' &&
      !sourceEmail.startsWith('mailer-daemon@')
    ) {
      try {
        const bouncedRecipients: string[] = Array.isArray(
          sesEvent.bounce?.bouncedRecipients
        )
          ? sesEvent.bounce.bouncedRecipients
              .map((r: any) => String(r?.emailAddress || '').trim())
              .filter(Boolean)
          : [];
        const diagnosticCode =
          sesEvent.bounce?.bouncedRecipients?.[0]?.diagnosticCode ||
          sesEvent.bounce?.bounceSubType ||
          'Permanent delivery failure';

        await sendRevletMailerDaemonEmail({
          to: sourceEmail,
          subject: 'Delivery Status Notification (Failure)',
          title: 'Delivery Status Notification (Failure)',
          subtitle: 'Mail Delivery Subsystem · mailer-daemon@revlet.me',
          summaryLines: [
            'An error occurred while trying to deliver your message to the following recipient(s):',
            ...(bouncedRecipients.length > 0
              ? bouncedRecipients
              : ['Unknown recipient']),
          ],
          details: [
            { label: 'Reporting MTA', value: 'mx.revlet.me (mailer-daemon@revlet.me)' },
            { label: 'Bounce Type', value: String(sesEvent.bounce?.bounceType || 'Permanent') },
            { label: 'Diagnostic', value: String(diagnosticCode) },
          ],
        });
      } catch {
        // Non-blocking DSN notification
      }
    }

    if (result.autoPaused && !result.wasAlreadyPaused) {
      try {
        const ownerEmail = await resolveOrganizationOwnerEmail(result.orgData);
        if (ownerEmail) {
          const triggerReason =
            result.complaintRate > 0.1 && result.complaints >= 2
              ? `Complaint rate (${result.complaintRate}%) exceeded 0.1%`
              : `Hard bounce rate (${result.bounceRate}%) exceeded 5.0%`;

          await sendRevletAlertEmail({
            to: ownerEmail,
            subject: `[Revlet Alert] Outbound Mail Auto-Paused for ${result.domain}`,
            title: 'Outbound Mail Auto-Paused',
            subtitle: 'Deliverability & Abuse Protection',
            summaryLines: [
              `Outbound mail for ${result.domain} has been automatically paused to protect your domain reputation.`,
              'Review recent recipient lists and bounced addresses before resuming outbound mail in the Revlet Console.',
            ],
            details: [
              { label: 'Domain', value: result.domain },
              { label: 'Trigger', value: triggerReason },
              { label: 'Bounce Rate', value: `${result.bounceRate}% (${result.bounces} permanent)` },
              { label: 'Complaint Rate', value: `${result.complaintRate}% (${result.complaints} complaints)` },
            ],
            ctaUrl: 'https://app.revlet.me/services/email',
            ctaLabel: 'Review Email Service',
          });
        }
      } catch {
        // Non-blocking alert failure
      }
    }

    const { orgData: _orgData, wasAlreadyPaused: _wasAlreadyPaused, ...publicResult } = result;
    return NextResponse.json({ ok: true, ...publicResult });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to process SNS bounce webhook' },
      { status: 400 }
    );
  }
}
