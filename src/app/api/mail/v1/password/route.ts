import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';
import {
  verifyMailPasswordHash,
  hashMailPassword,
} from '@/lib/security/mail-crypto';
import { syncStalwartUserPrincipal } from '@/app/actions/revlet-mail';

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
 * POST /api/mail/v1/password
 * Internal control-plane endpoint to update a mailbox user's password.
 * Verifies current password against Firestore scrypt hash, updates hash,
 * and synchronizes new credentials to Stalwart Mail Server.
 */
export async function POST(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized: Invalid internal service token.' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.orgId === 'string' ? body.orgId.trim() : '';
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!orgId || !userId || !currentPassword || !newPassword) {
      return NextResponse.json(
        { ok: false, error: 'Missing required parameters.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { ok: false, error: 'New password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const orgDoc = await orgRef.get();
    if (!orgDoc.exists) {
      return NextResponse.json(
        { ok: false, error: 'Organization not found.' },
        { status: 404 }
      );
    }

    const userRef = orgRef.collection('mailUsers').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { ok: false, error: 'Email account not found.' },
        { status: 404 }
      );
    }

    const userData = userDoc.data()!;
    if (userData.status !== 'active') {
      return NextResponse.json(
        {
          ok: false,
          error:
            userData.status === 'suspended'
              ? 'This email account is suspended.'
              : 'This email account is unavailable.',
        },
        { status: 403 }
      );
    }

    // Verify current password
    const isCurrentValid = verifyMailPasswordHash(currentPassword, userData.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { ok: false, error: 'Current password is incorrect.' },
        { status: 400 }
      );
    }

    // Update password hash in Firestore
    const newHash = hashMailPassword(newPassword);
    const nowIso = new Date().toISOString();
    await userRef.update({
      passwordHash: newHash,
      updatedAt: nowIso,
    });

    // Synchronize new credentials to Stalwart Mail Server
    const orgData = orgDoc.data() || {};
    const domain = (orgData.domain || '').toLowerCase().trim();

    try {
      await syncStalwartUserPrincipal({
        primaryEmail: userData.primaryEmail,
        displayName: userData.displayName || userData.firstName,
        orgUnitPath: userData.orgUnitPath || '/',
        aliases: Array.isArray(userData.aliases) ? userData.aliases : [],
        domain,
        isCatchAllTarget: orgData.mailCatchAllUserId === userId,
        plainPassword: newPassword,
      });
    } catch (stalwartErr: any) {
      console.error('Failed to sync updated password to Stalwart:', stalwartErr);
    }

    return NextResponse.json({
      ok: true,
      message: 'Password updated successfully.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to update password.' },
      { status: 500 }
    );
  }
}
