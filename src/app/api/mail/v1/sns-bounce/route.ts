import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';

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
    if (parsed.pathname.includes('..')) return null;
    if (requirePem && !parsed.pathname.endsWith('.pem')) return null;
    const safeOrigin = AWS_SNS_HOSTS.get(parsed.hostname.toLowerCase());
    if (!safeOrigin) return null;
    return new URL(`${parsed.pathname}${parsed.search}`, safeOrigin).toString();
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
    if (notificationType !== 'Bounce' && notificationType !== 'Complaint') {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const sourceEmail: string = (sesEvent.mail?.source || sesEvent.fromEmail || '').toLowerCase().trim();
    const domain = sourceEmail.includes('@') ? sourceEmail.split('@')[1] : '';
    if (!domain) {
      return NextResponse.json({ ok: false, error: 'Missing source domain' }, { status: 400 });
    }

    const orgSnap = await adminDb
      .collection('organizations')
      .where('domain', '==', domain)
      .limit(1)
      .get();

    if (orgSnap.empty) {
      return NextResponse.json({ ok: true, skipped: 'Domain not registered' });
    }

    const orgRef = orgSnap.docs[0].ref;
    const isBounce = notificationType === 'Bounce';
    const isPermanentBounce = !isBounce || sesEvent.bounce?.bounceType === 'Permanent';

    if (isBounce && !isPermanentBounce) {
      // Transient soft bounces do not trigger auto-pause
      return NextResponse.json({ ok: true, transient: true });
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(orgRef);
      const d = snap.data() || {};

      const currentMonthKey = new Date().toISOString().slice(0, 7);
      const sameMonth = d.mailBounceBucket === currentMonthKey;

      const bounces = (sameMonth ? d.mailBounceCount ?? 0 : 0) + (isBounce ? 1 : 0);
      const complaints = (sameMonth ? d.mailComplaintCount ?? 0 : 0) + (!isBounce ? 1 : 0);
      const sentBaseline = Math.max(20, d.mailMonthlySent ?? 0);

      const bounceRate = Number(((bounces / sentBaseline) * 100).toFixed(2));
      const complaintRate = Number(((complaints / sentBaseline) * 100).toFixed(2));

      const shouldAutoPause = (bounces >= 5 && bounceRate > 5.0) || (complaints >= 2 && complaintRate > 0.1);

      tx.update(orgRef, {
        mailBounceCount: bounces,
        mailComplaintCount: complaints,
        mailBounceBucket: currentMonthKey,
        mailBounceRate: bounceRate,
        mailComplaintRate: complaintRate,
        ...(shouldAutoPause ? { mailOutboundPaused: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { domain, bounces, complaints, bounceRate, complaintRate, autoPaused: shouldAutoPause };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to process SNS bounce webhook' },
      { status: 400 }
    );
  }
}
