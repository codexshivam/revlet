import crypto from 'crypto';
import { z } from 'zod';
import { calculateRollingQuota } from '@/lib/mail-internal';
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
    const rawBody = await req.json();
    const parsed = z
      .object({
        email: z.string().trim().email().transform((v) => v.toLowerCase()),
        password: z.string().min(1),
      })
      .safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Valid email and password are required.' },
        { status: 400 }
      );
    }

    const emailInput = parsed.data.email;
    const passwordInput = parsed.data.password;
    const atIndex = emailInput.lastIndexOf('@');
    const domain = emailInput.slice(atIndex + 1);

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

    // Derive granular RBAC role from orgData.memberPermissions or mailbox record
    const primaryLower = (userData.primaryEmail || '').toLowerCase();
    const emailPermKey = primaryLower.replace(/\./g, '__DOT__');
    const orgPerms: string[] = Array.isArray(orgData.memberPermissions?.[emailPermKey])
      ? orgData.memberPermissions[emailPermKey]
      : [];
    let derivedRole = userData.role || 'MEMBER';
    if (orgPerms.includes('*') || orgPerms.includes('Org: Admin')) derivedRole = 'ORG_ADMIN';
    else if (orgPerms.includes('Security: Admin')) derivedRole = 'SECURITY_ADMIN';
    else if (orgPerms.includes('Compliance: Admin')) derivedRole = 'COMPLIANCE_ADMIN';
    else if (orgPerms.includes('HelpDesk: Admin')) derivedRole = 'HELP_DESK_ADMIN';

    // Fetch delegated shared mailboxes for this user
    const sharedSnap = await orgDoc.ref.collection('mailSharedMailboxes').get();
    const sharedMailboxes = sharedSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((sm) =>
        Array.isArray(sm.delegates) &&
        sm.delegates.some((del: any) => (del.email || '').toLowerCase() === primaryLower)
      )
      .map((sm) => {
        const match = sm.delegates.find((del: any) => (del.email || '').toLowerCase() === primaryLower);
        return {
          id: sm.id,
          displayName: sm.displayName,
          email: sm.email,
          accessLevel: match?.accessLevel || 'READ_ONLY',
        };
      });

    const mfaSnap = await orgDoc.ref
      .collection('mailUserMfa')
      .doc(encodeURIComponent(primaryLower))
      .get();
    const mfaData = mfaSnap.exists ? mfaSnap.data() || {} : {};
    const enrolledMethods: string[] = [];
    if (mfaData.totpEnabled && mfaData.totpSecret) enrolledMethods.push('totp');
    if (Array.isArray(mfaData.passkeys) && mfaData.passkeys.length > 0) enrolledMethods.push('passkey');
    if (mfaData.secondaryEmailVerified && mfaData.secondaryEmail) enrolledMethods.push('secondary_email');

    return NextResponse.json({
      ok: true,
      organization: {
        id: orgDoc.id,
        name: orgData.name,
        domain,
        enforceMfa: Boolean(orgData.enforceMfa),
        monthlyOutboundLimit: orgData.mailMonthlyLimit ?? 1000,
        dailyOutboundLimit: orgData.mailDailyLimit ?? 100,
        monthlySentCount: rolling.monthlySentCount,
        dailySentCount: rolling.dailySentCount,
      },
      mfa: {
        enabled: enrolledMethods.length > 0,
        methods: enrolledMethods,
      },
      mailbox: {
        id: matchedDoc.id,
        firstName: userData.firstName,
        lastName: userData.lastName,
        displayName: userData.displayName,
        primaryEmail: userData.primaryEmail,
        role: derivedRole,
        aliases,
        sharedMailboxes,
        orgUnitPath: userData.orgUnitPath || '/',
        isCatchAllTarget,
        stalwartAccountId:
          typeof userData.stalwartAccountId === 'string' && userData.stalwartAccountId.trim()
            ? userData.stalwartAccountId.trim()
            : null,
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
