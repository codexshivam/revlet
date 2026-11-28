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

export async function GET(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const mode = (req.nextUrl.searchParams.get('mode') || '').trim();
    if (mode === 'due') {
      const nowIso = new Date().toISOString();
      const snap = await adminDb
        .collectionGroup('mailScheduledMessages')
        .where('status', '==', 'scheduled')
        .where('sendAt', '<=', nowIso)
        .limit(25)
        .get();

      const claimed: any[] = [];
      for (const doc of snap.docs) {
        try {
          const item = await adminDb.runTransaction(async (tx) => {
            const fresh = await tx.get(doc.ref);
            if (!fresh.exists) return null;
            const d = fresh.data() || {};
            if (d.status !== 'scheduled' || String(d.sendAt || '') > nowIso) return null;
            tx.update(doc.ref, {
              status: 'dispatching',
              dispatchStartedAt: nowIso,
              updatedAt: nowIso,
            });
            return { id: fresh.id, ...d, status: 'dispatching' };
          });
          if (item) claimed.push(item);
        } catch {
          // Concurrent worker claimed this job
        }
      }
      return NextResponse.json({ ok: true, jobs: claimed });
    }

    const orgId = (req.nextUrl.searchParams.get('orgId') || '').trim();
    const ownerEmail = (req.nextUrl.searchParams.get('ownerEmail') || '').toLowerCase().trim();
    if (!orgId || !ownerEmail) {
      return NextResponse.json({ ok: false, error: 'orgId and ownerEmail are required.' }, { status: 400 });
    }

    const snap = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailScheduledMessages')
      .where('ownerEmail', '==', ownerEmail)
      .limit(100)
      .get();

    const items = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((item: any) => item.status === 'scheduled' || item.status === 'dispatching' || item.status === 'failed')
      .sort((a: any, b: any) => String(a.sendAt || '').localeCompare(String(b.sendAt || '')));

    return NextResponse.json({ ok: true, scheduled: items });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to query scheduled messages.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const orgId = String(body.orgId || '').trim();
    const ownerEmail = String(body.ownerEmail || '').toLowerCase().trim();
    const id = String(body.id || '').trim() || `sched-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

    if (!orgId || !ownerEmail) {
      return NextResponse.json({ ok: false, error: 'orgId and ownerEmail are required.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const record = {
      id,
      orgId,
      actorUid: String(body.actorUid || ownerEmail),
      ownerEmail,
      fromEmail: String(body.fromEmail || ownerEmail).toLowerCase().trim(),
      fromName: String(body.fromName || ownerEmail),
      to: Array.isArray(body.to) ? body.to : [],
      cc: Array.isArray(body.cc) ? body.cc : [],
      bcc: Array.isArray(body.bcc) ? body.bcc : [],
      subject: String(body.subject || '(No Subject)').slice(0, 500),
      bodyText: String(body.bodyText || ''),
      bodyHtml: String(body.bodyHtml || ''),
      inReplyTo: Array.isArray(body.inReplyTo) ? body.inReplyTo.filter((v: unknown) => typeof v === 'string').slice(0, 40) : [],
      references: Array.isArray(body.references) ? body.references.filter((v: unknown) => typeof v === 'string').slice(0, 80) : [],
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      sendAt: String(body.sendAt || nowIso),
      timeZone: typeof body.timeZone === 'string' ? body.timeZone.slice(0, 64) : 'UTC',
      submissionId: String(body.submissionId || id),
      draftId: typeof body.draftId === 'string' && body.draftId.trim() ? body.draftId.trim() : null,
      status: 'scheduled',
      createdAt: nowIso,
      updatedAt: nowIso,
      timestamp: FieldValue.serverTimestamp(),
    };

    await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailScheduledMessages')
      .doc(id)
      .set(record);

    return NextResponse.json({ ok: true, scheduled: record });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to persist scheduled message.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const orgId = String(body.orgId || '').trim();
    const id = String(body.id || '').trim();
    if (!orgId || !id) {
      return NextResponse.json({ ok: false, error: 'orgId and id are required.' }, { status: 400 });
    }

    const docRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailScheduledMessages')
      .doc(id);

    const nowIso = new Date().toISOString();

    // Dispatcher status transition (system update)
    if (body.systemTransition === true) {
      const nextStatus = String(body.status || '').trim();
      if (!['scheduled', 'sent', 'failed'].includes(nextStatus)) {
        return NextResponse.json({ ok: false, error: 'Invalid status transition.' }, { status: 400 });
      }
      await docRef.update({
        status: nextStatus,
        ...(typeof body.error === 'string' ? { error: body.error.slice(0, 1000) } : {}),
        ...(nextStatus === 'sent' ? { sentAt: nowIso, error: FieldValue.delete() } : {}),
        ...(body.deliveryState ? { deliveryState: String(body.deliveryState) } : {}),
        updatedAt: nowIso,
      });
      return NextResponse.json({ ok: true });
    }

    // User edit — permitted ONLY while job is still pending ('scheduled' or 'failed')
    const ownerEmail = String(body.ownerEmail || '').toLowerCase().trim();
    const updated = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return { status: 404 as const, error: 'Scheduled message not found.' };
      const d = snap.data() || {};
      if (ownerEmail && d.ownerEmail !== ownerEmail) {
        return { status: 403 as const, error: 'Forbidden' };
      }
      if (d.status !== 'scheduled' && d.status !== 'failed') {
        return { status: 409 as const, error: 'Message is already dispatching or sent and cannot be edited.' };
      }
      const patch: Record<string, any> = {
        status: 'scheduled',
        error: FieldValue.delete(),
        updatedAt: nowIso,
      };
      if (typeof body.sendAt === 'string' && !Number.isNaN(new Date(body.sendAt).getTime())) {
        patch.sendAt = new Date(body.sendAt).toISOString();
      }
      if (typeof body.subject === 'string') patch.subject = body.subject.slice(0, 500);
      if (typeof body.bodyText === 'string') patch.bodyText = body.bodyText;
      if (typeof body.bodyHtml === 'string') patch.bodyHtml = body.bodyHtml;
      if (Array.isArray(body.to)) patch.to = body.to;
      if (Array.isArray(body.cc)) patch.cc = body.cc;
      if (Array.isArray(body.bcc)) patch.bcc = body.bcc;
      tx.update(docRef, patch);
      return { status: 200 as const, data: { id, ...d, ...patch } };
    });

    if (updated.status !== 200) {
      return NextResponse.json({ ok: false, error: updated.error }, { status: updated.status });
    }
    return NextResponse.json({ ok: true, scheduled: updated.data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to update scheduled message.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orgId = (req.nextUrl.searchParams.get('orgId') || '').trim();
    const id = (req.nextUrl.searchParams.get('id') || '').trim();
    const ownerEmail = (req.nextUrl.searchParams.get('ownerEmail') || '').toLowerCase().trim();
    if (!orgId || !id || !ownerEmail) {
      return NextResponse.json({ ok: false, error: 'orgId, id, and ownerEmail are required.' }, { status: 400 });
    }

    const docRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailScheduledMessages')
      .doc(id);

    const outcome = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return { status: 404 as const, error: 'Scheduled message not found.' };
      const d = snap.data() || {};
      if (d.ownerEmail !== ownerEmail) {
        return { status: 403 as const, error: 'Forbidden' };
      }
      if (d.status !== 'scheduled' && d.status !== 'failed') {
        return {
          status: 409 as const,
          error: 'This message is already dispatching or sent and can no longer be cancelled.',
        };
      }
      tx.delete(docRef);
      return { status: 200 as const };
    });

    if (outcome.status !== 200) {
      return NextResponse.json({ ok: false, error: outcome.error }, { status: outcome.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to cancel scheduled message.' },
      { status: 500 }
    );
  }
}
