import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';
import { calculateRollingQuota } from '@/lib/mail-internal';
import { buildCanonicalStalwartEmails } from '@/lib/security/mail-crypto';

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
 * GET /api/mail/v1/directory?domain=example.com
 * Returns the live Principal Directory (active mailboxes, 1-to-1 aliases, catch-all routing,
 * organizational units, and 1-to-Many distribution groups) for a managed organization domain.
 * Never returns passwordHash.
 */
export async function GET(req: NextRequest) {
  if (!verifyInternalServiceSecret(req)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized: Invalid internal service token.' },
      { status: 401 }
    );
  }

  try {
    const domain = (req.nextUrl.searchParams.get('domain') || '').toLowerCase().trim();
    if (!domain) {
      return NextResponse.json(
        { ok: false, error: 'Missing domain query parameter.' },
        { status: 400 }
      );
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

    const [usersSnap, groupsSnap, ousSnap, sharedSnap] = await Promise.all([
      orgDoc.ref.collection('mailUsers').get(),
      orgDoc.ref.collection('mailGroups').get(),
      orgDoc.ref.collection('mailOrgUnits').get(),
      orgDoc.ref.collection('mailSharedMailboxes').get(),
    ]);

    const sharedMailboxes = sharedSnap.docs.map((doc) => {
      const sd = doc.data();
      return {
        id: doc.id,
        displayName: String(sd.displayName || sd.email || ''),
        email: String(sd.email || '').toLowerCase(),
        delegates: Array.isArray(sd.delegates)
          ? sd.delegates.map((del: any) => ({
              email: String(del?.email || '').toLowerCase(),
              accessLevel: (del?.accessLevel || 'FULL_ACCESS') as
                | 'FULL_ACCESS'
                | 'SEND_AS'
                | 'READ_ONLY',
            }))
          : [],
      };
    });

    const mailboxes = usersSnap.docs
      .map((doc) => {
        const d = doc.data();
        const primaryEmail = (d.primaryEmail || '').toLowerCase();
        const aliases: string[] = Array.isArray(d.aliases) ? d.aliases : [];
        const isCatchAllTarget = orgData.mailCatchAllUserId === doc.id;
        const userSharedMailboxes = sharedMailboxes
          .map((sm) => {
            const match = sm.delegates.find(
              (del) => del.email.toLowerCase() === primaryEmail
            );
            if (!match) return null;
            return {
              id: sm.id,
              displayName: sm.displayName,
              email: sm.email,
              accessLevel: match.accessLevel,
            };
          })
          .filter(Boolean);
        return {
          id: doc.id,
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          displayName: d.displayName || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
          primaryEmail: d.primaryEmail || '',
          aliases,
          sharedMailboxes: userSharedMailboxes,
          orgUnitPath: d.orgUnitPath || '/',
          status: d.status || 'active',
          isCatchAllTarget,
          stalwartEmails: buildCanonicalStalwartEmails(
            d.primaryEmail || '',
            aliases,
            domain,
            isCatchAllTarget
          ),
        };
      })
      .filter((u) => u.status === 'active');

    const groups = groupsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name || '',
        groupEmail: d.groupEmail || '',
        orgUnitPath: d.orgUnitPath || '/',
        memberEmails: Array.isArray(d.memberEmails) ? d.memberEmails : [],
      };
    });

    const orgUnits = ousSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name || '',
        path: d.path || `/${d.name || ''}`,
        description: d.description || '',
      };
    });

    const rolling = await calculateRollingQuota(orgData);

    return NextResponse.json({
      ok: true,
      organization: {
        id: orgDoc.id,
        name: orgData.name,
        domain,
        mailServiceActive: Boolean(orgData.mailServiceActive),
        catchAllUserId: orgData.mailCatchAllUserId || null,
        catchAllEmail: orgData.mailCatchAllEmail || null,
        monthlyOutboundLimit: orgData.mailMonthlyLimit ?? 1000,
        dailyOutboundLimit: orgData.mailDailyLimit ?? 100,
        monthlySentCount: rolling.monthlySentCount,
        dailySentCount: rolling.dailySentCount,
      },
      mailboxes,
      groups,
      sharedMailboxes,
      orgUnits,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to resolve directory.' },
      { status: 500 }
    );
  }
}
