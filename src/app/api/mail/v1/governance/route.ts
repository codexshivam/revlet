import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { logMailAuditEvent } from '@/lib/mail-internal';

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

export async function GET(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orgId = (req.nextUrl.searchParams.get('orgId') || '').trim();
    const domain = (req.nextUrl.searchParams.get('domain') || '').toLowerCase().trim();
    const allHolds = req.nextUrl.searchParams.get('allHolds') === '1';

    if (allHolds) {
      const orgsSnap = await adminDb.collection('organizations').where('mailServiceActive', '==', true).get();
      const heldOrgs: string[] = [];
      const heldCustodians: string[] = [];
      for (const orgDoc of orgsSnap.docs) {
        const holdsSnap = await orgDoc.ref.collection('mailLegalHolds').where('status', '==', 'active').get();
        for (const h of holdsSnap.docs) {
          const data = h.data();
          if (data.holdAllMailboxes) heldOrgs.push(orgDoc.id);
          if (Array.isArray(data.custodianEmails)) {
            heldCustodians.push(...data.custodianEmails.map((e: string) => e.toLowerCase()));
          }
        }
      }
      return NextResponse.json({
        ok: true,
        heldOrgIds: Array.from(new Set(heldOrgs)),
        heldCustodianEmails: Array.from(new Set(heldCustodians)),
      });
    }

    let orgDoc;
    if (orgId) {
      const snap = await adminDb.collection('organizations').doc(orgId).get();
      if (snap.exists) orgDoc = snap;
    } else if (domain) {
      const snap = await adminDb.collection('organizations').where('domain', '==', domain).limit(1).get();
      if (!snap.empty) orgDoc = snap.docs[0];
    }

    if (!orgDoc) {
      return NextResponse.json({ ok: false, error: 'Organization not found.' }, { status: 404 });
    }

    const [holdsSnap, dlpSnap, transportSnap, sharedSnap] = await Promise.all([
      orgDoc.ref.collection('mailLegalHolds').where('status', '==', 'active').get(),
      orgDoc.ref.collection('mailDlpRules').where('enabled', '==', true).get(),
      orgDoc.ref.collection('mailTransportRules').where('enabled', '==', true).get(),
      orgDoc.ref.collection('mailSharedMailboxes').get(),
    ]);

    return NextResponse.json({
      ok: true,
      orgId: orgDoc.id,
      legalHolds: holdsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      dlpRules: dlpSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      transportRules: transportSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      sharedMailboxes: sharedSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.orgId === 'string' ? body.orgId.trim() : '';
    const type = body.type as 'audit' | 'quarantine';
    if (!orgId || !type) {
      return NextResponse.json({ ok: false, error: 'orgId and type are required.' }, { status: 400 });
    }

    if (type === 'audit') {
      await logMailAuditEvent({
        orgId,
        actorUid: body.actorUid || 'webmail-user',
        actorEmail: body.actorEmail,
        action: body.action || 'MAIL_EVENT',
        target: body.target || orgId,
        metadata: body.metadata || {},
      });
      return NextResponse.json({ ok: true });
    }

    if (type === 'quarantine') {
      const ref = await adminDb
        .collection('organizations')
        .doc(orgId)
        .collection('mailQuarantine')
        .add({
          sender: body.sender || '',
          recipients: Array.isArray(body.recipients) ? body.recipients : [],
          subject: body.subject || '(No Subject)',
          snippet: body.snippet || '',
          bodyText: typeof body.bodyText === 'string' ? body.bodyText.slice(0, 10000) : '',
          reason: body.reason || 'DLP',
          matchedRule: body.matchedRule || 'Policy Match',
          score: typeof body.score === 'number' ? body.score : 95,
          status: 'quarantined',
          receivedAt: new Date().toISOString(),
          timestamp: FieldValue.serverTimestamp(),
        });

      await logMailAuditEvent({
        orgId,
        actorUid: 'dlp-engine',
        actorEmail: body.sender,
        action: 'MESSAGE_QUARANTINED',
        target: ref.id,
        metadata: { reason: body.reason, matchedRule: body.matchedRule, subject: body.subject },
      });

      return NextResponse.json({ ok: true, id: ref.id });
    }

    return NextResponse.json({ ok: false, error: 'Invalid type' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Internal error' }, { status: 500 });
  }
}
