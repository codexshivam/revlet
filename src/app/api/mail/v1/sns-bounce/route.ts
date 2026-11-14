import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';

/**
 * POST /api/mail/v1/sns-bounce
 * AWS SNS Bounce & Complaint Webhook Receiver.
 * Automatically confirms SNS subscriptions and tracks domain-level bounce/complaint rates,
 * auto-pausing outbound mail (`mailOutboundPaused = true`) if bounce rate exceeds 5.0%.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody || '{}');

    // 1. Handle AWS SNS SubscriptionConfirmation automatically (strictly validate amazonaws.com host)
    if (body.Type === 'SubscriptionConfirmation' && typeof body.SubscribeURL === 'string') {
      try {
        const subUrl = new URL(body.SubscribeURL);
        if (subUrl.protocol === 'https:' && subUrl.hostname.endsWith('.amazonaws.com')) {
          await fetch(subUrl.toString(), { method: 'GET', cache: 'no-store' });
          return NextResponse.json({ ok: true, confirmed: true });
        }
      } catch {
        return NextResponse.json({ ok: false, error: 'Invalid SubscribeURL' }, { status: 400 });
      }
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
