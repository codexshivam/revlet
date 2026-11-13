import crypto from 'crypto';
import { calculateRollingQuota } from '@/app/actions/revlet-mail';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';
import {
  verifyMailPasswordHash,
  buildCanonicalStalwartEmails,
} from '@/lib/security/mail-crypto';

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
 * POST /api/mail/v1/auth
 * Internal control-plane authentication endpoint for Revlet Mail (mail.revlet.me) & Stalwart JMAP.
 * Verifies a mailbox user's email (or alias) and password against the organization's
 * scrypt passwordHash in Firestore and returns canonical JMAP Send-As identities
 * with primaryEmail guaranteed at index 0.
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
    const emailInput = (body.email || '').toLowerCase().trim();
    const passwordInput = typeof body.password === 'string' ? body.password : '';

    if (!emailInput || !emailInput.includes('@') || !passwordInput) {
      return NextResponse.json(
        { ok: false, error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const domain = emailInput.split('@')[1]?.toLowerCase().trim();
    if (!domain) {
      return NextResponse.json({ ok: false, error: 'Invalid email domain.' }, { status: 400 });
    }

    const orgSnap = await adminDb
      .collection('organizations')
      .where('domain', '==', domain)
      .limit(1)
      .get();

    if (orgSnap.empty) {
      return NextResponse.json(
        { ok: false, error: 'Organization domain not found.' },
        { status: 404 }
      );
    }

    const orgDoc = orgSnap.docs[0];
    const orgData = orgDoc.data();

    if (!orgData.mailServiceActive) {
      return NextResponse.json(
        { ok: false, error: 'Email Service is currently inactive for this organization.' },
        { status: 403 }
      );
    }

    const usersSnap = await orgDoc.ref.collection('mailUsers').get();
    const matchedDoc = usersSnap.docs.find((d) => {
      const data = d.data();
      if ((data.primaryEmail || '').toLowerCase() === emailInput) return true;
      const aliases: string[] = Array.isArray(data.aliases) ? data.aliases : [];
      return aliases.some((a) => a.toLowerCase() === emailInput);
    });

    if (!matchedDoc) {
      return NextResponse.json({ ok: false, error: 'Invalid credentials.' }, { status: 401 });
    }

    const userData = matchedDoc.data();
    if (userData.status !== 'active') {
      return NextResponse.json(
        {
          ok: false,
          error:
            userData.status === 'suspended'
              ? 'This email account is suspended by your organization administrator.'
              : 'This email account is unavailable.',
        },
        { status: 403 }
      );
    }

    const isPasswordValid = verifyMailPasswordHash(passwordInput, userData.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json({ ok: false, error: 'Invalid credentials.' }, { status: 401 });
    }

    const aliases: string[] = Array.isArray(userData.aliases) ? userData.aliases : [];
    const isCatchAllTarget = orgData.mailCatchAllUserId === matchedDoc.id;
    const canonicalEmails = buildCanonicalStalwartEmails(
      userData.primaryEmail,
      aliases,
      domain,
      isCatchAllTarget
    );

    const identities = [
      {
        id: `id-primary-${matchedDoc.id}`,
        name: userData.displayName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
        email: userData.primaryEmail,
        isPrimary: true,
        mayDelete: false,
      },
      ...aliases.map((aliasEmail, idx) => ({
        id: `id-alias-${matchedDoc.id}-${idx}`,
        name: userData.displayName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
        email: aliasEmail,
        isPrimary: false,
        mayDelete: true,
      })),
    ];

    const rolling = await calculateRollingQuota(orgData);

    return NextResponse.json({
      ok: true,
      organization: {
        id: orgDoc.id,
        name: orgData.name,
        domain,
        monthlyOutboundLimit: orgData.mailMonthlyLimit ?? 1000,
        dailyOutboundLimit: orgData.mailDailyLimit ?? 100,
        monthlySentCount: rolling.monthlySentCount,
        dailySentCount: rolling.dailySentCount,
      },
      mailbox: {
        id: matchedDoc.id,
        firstName: userData.firstName,
        lastName: userData.lastName,
        displayName: userData.displayName,
        primaryEmail: userData.primaryEmail,
        aliases,
        orgUnitPath: userData.orgUnitPath || '/',
        isCatchAllTarget,
        canonicalStalwartEmails: canonicalEmails,
        identities,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal authentication error.' },
      { status: 500 }
    );
  }
}
