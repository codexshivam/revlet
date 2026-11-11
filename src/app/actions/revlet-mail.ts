'use server';

import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { verifyUserOrgAccess } from './auth-helper';
import {
  listDNSRecords,
  createDNSRecord,
  deleteDNSRecord,
  createZoneSnapshot,
} from './cloudflare-dns';

export interface MailRequiredDnsRecord {
  id: string;
  purpose: string;
  type: 'MX' | 'TXT' | 'CNAME';
  name: string;
  content: string;
  priority?: number;
  ttl: string;
  verified: boolean;
}

export interface MailOrgUnit {
  id: string;
  name: string;
  path: string;
  description: string;
  createdAt: string;
}

export interface MailUserRecord {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  primaryEmail: string;
  aliases: string[];
  orgUnitPath: string;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  recoverableUntil: string | null;
}

export interface MailGroupRecord {
  id: string;
  name: string;
  groupEmail: string;
  orgUnitPath: string;
  memberEmails: string[];
  createdAt: string;
  updatedAt: string;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function hashMailPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function generateDeterministicDkimTokens(orgId: string, domain: string): string[] {
  return [1, 2, 3].map((index) =>
    crypto
      .createHash('sha256')
      .update(`revlet-mail-dkim-${orgId}-${domain}-${index}`)
      .digest('hex')
      .slice(0, 24)
  );
}

function buildRequiredDnsRecords(
  domain: string,
  dkimTokens: string[],
  liveRecords: Array<{ type: string; name: string; content: string; priority?: number }> = []
): MailRequiredDnsRecord[] {
  const normalizedDomain = domain.toLowerCase().trim();

  const isPresent = (type: string, expectedName: string, expectedContentFragment: string) => {
    const cleanExpectedName = expectedName.toLowerCase().replace(/\.$/, '');
    const cleanExpectedContent = expectedContentFragment.toLowerCase().replace(/\.$/, '');

    return liveRecords.some((r) => {
      if (r.type?.toUpperCase() !== type.toUpperCase()) return false;
      const rName = (r.name || '').toLowerCase().replace(/\.$/, '');
      const nameMatches =
        rName === cleanExpectedName ||
        (cleanExpectedName === normalizedDomain && (rName === '@' || rName === normalizedDomain));
      if (!nameMatches) return false;
      const rContent = (r.content || '').toLowerCase().replace(/\.$/, '');
      return rContent.includes(cleanExpectedContent);
    });
  };

  const records: MailRequiredDnsRecord[] = [
    {
      id: 'mx-primary',
      purpose: 'Inbound Mail Routing (MX)',
      type: 'MX',
      name: normalizedDomain,
      content: 'mx.revlet.me',
      priority: 10,
      ttl: 'Auto',
      verified: isPresent('MX', normalizedDomain, 'mx.revlet.me'),
    },
    {
      id: 'txt-spf',
      purpose: 'Sender Policy Authorization (SPF)',
      type: 'TXT',
      name: normalizedDomain,
      content: 'v=spf1 include:_spf.mx.revlet.me ~all',
      ttl: 'Auto',
      verified: isPresent('TXT', normalizedDomain, 'include:_spf.mx.revlet.me'),
    },
    {
      id: 'txt-dmarc',
      purpose: 'Domain Authentication Policy (DMARC)',
      type: 'TXT',
      name: `_dmarc.${normalizedDomain}`,
      content: 'v=DMARC1; p=quarantine; pct=100;',
      ttl: 'Auto',
      verified: isPresent('TXT', `_dmarc.${normalizedDomain}`, 'v=dmarc1'),
    },
  ];

  dkimTokens.slice(0, 3).forEach((token, idx) => {
    const recordName = `${token}._domainkey.${normalizedDomain}`;
    const recordTarget = `${token}.dkim.revlet.me`;
    records.push({
      id: `cname-dkim-${idx + 1}`,
      purpose: `Domain Signing Key #${idx + 1} (DKIM)`,
      type: 'CNAME',
      name: recordName,
      content: recordTarget,
      ttl: 'Auto',
      verified: isPresent('CNAME', recordName, recordTarget),
    });
  });

  return records;
}

async function ensureOrgDkimTokens(orgId: string, orgData: FirebaseFirestore.DocumentData): Promise<string[]> {
  if (Array.isArray(orgData.mailDkimTokens) && orgData.mailDkimTokens.length === 3) {
    return orgData.mailDkimTokens;
  }
  const tokens = generateDeterministicDkimTokens(orgId, orgData.domain || orgId);
  await adminDb.collection('organizations').doc(orgId).update({
    mailDkimTokens: tokens,
  });
  return tokens;
}

async function provisionRequiredDnsRecordsOnZone(
  idToken: string,
  orgId: string,
  zoneId: string,
  domainName: string,
  dkimTokens: string[]
): Promise<{ success: boolean; addedCount: number; error?: string }> {
  try {
    try {
      await createZoneSnapshot(idToken, orgId, zoneId, 'Pre-Email Service DNS configuration backup');
    } catch {
      // Proceed even if snapshot logging encounters a non-fatal warning
    }

    const existingRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!existingRes.success) {
      return { success: false, addedCount: 0, error: existingRes.error || 'Could not inspect domain records.' };
    }

    const currentRecords: any[] = existingRes.data || [];
    const normalizedDomain = domainName.toLowerCase().trim();

    // Remove conflicting root MX or SPF records that do not match Email Service
    const conflictingRootRecords = currentRecords.filter((r: any) => {
      const rName = (r.name || '').toLowerCase().replace(/\.$/, '');
      const isRoot = rName === normalizedDomain || rName === '@';
      if (!isRoot) return false;
      if (r.type === 'MX' && !(r.content || '').toLowerCase().includes('mx.revlet.me')) {
        return true;
      }
      if (
        r.type === 'TXT' &&
        (r.content || '').toLowerCase().includes('v=spf1') &&
        !(r.content || '').toLowerCase().includes('_spf.mx.revlet.me')
      ) {
        return true;
      }
      return false;
    });

    for (const conflict of conflictingRootRecords) {
      await deleteDNSRecord(idToken, orgId, zoneId, conflict.id);
    }

    const refreshedRes = await listDNSRecords(idToken, orgId, zoneId);
    const liveAfterDelete: any[] = refreshedRes.success ? refreshedRes.data || [] : currentRecords;

    const requiredRecords = buildRequiredDnsRecords(normalizedDomain, dkimTokens, liveAfterDelete);
    let addedCount = 0;

    for (const req of requiredRecords) {
      if (!req.verified) {
        const createRes = await createDNSRecord(idToken, orgId, zoneId, {
          type: req.type,
          name: req.name,
          content: req.content,
          priority: req.priority,
          ttl: 'Auto',
          proxied: false,
        });
        if (createRes.success) {
          addedCount++;
        }
      }
    }

    return { success: true, addedCount };
  } catch (error: any) {
    return {
      success: false,
      addedCount: 0,
      error: error.message || 'Failed to provision required DNS records.',
    };
  }
}

export async function getMailServiceState(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { orgData } = await verifyUserOrgAccess(idToken, orgId);
    const domain = (orgData.domain || '').toLowerCase().trim();
    const dkimTokens = await ensureOrgDkimTokens(orgId, orgData);

    let liveRecords: any[] = [];
    const dnsServiceActive = Boolean(orgData.cloudflareZoneId);

    if (dnsServiceActive && orgData.cloudflareZoneId) {
      const dnsRes = await listDNSRecords(idToken, orgId, orgData.cloudflareZoneId);
      if (dnsRes.success && Array.isArray(dnsRes.data)) {
        liveRecords = dnsRes.data;
      }
    }

    const requiredDnsRecords = buildRequiredDnsRecords(domain, dkimTokens, liveRecords);

    return {
      success: true,
      data: {
        mailServiceActive: Boolean(orgData.mailServiceActive),
        dnsServiceActive,
        domain,
        monthlyOutboundLimit: orgData.mailMonthlyLimit ?? 1000,
        dailyOutboundLimit: orgData.mailDailyLimit ?? 100,
        monthlySentCount: orgData.mailMonthlySent ?? 0,
        dailySentCount: orgData.mailDailySent ?? 0,
        catchAllUserId: orgData.mailCatchAllUserId || null,
        catchAllEmail: orgData.mailCatchAllEmail || null,
        requiredDnsRecords,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load Email Service configuration.' };
  }
}

export async function activateMailService(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { orgData } = await verifyUserOrgAccess(idToken, orgId);
    const domain = (orgData.domain || '').toLowerCase().trim();
    if (!domain) {
      return { success: false, error: 'Organization does not have a valid domain configured.' };
    }

    const dkimTokens = await ensureOrgDkimTokens(orgId, orgData);
    let dnsProvisionedAutomatically = false;
    let dnsAddedCount = 0;
    let dnsWarning: string | undefined;

    if (orgData.cloudflareZoneId) {
      const dnsResult = await provisionRequiredDnsRecordsOnZone(
        idToken,
        orgId,
        orgData.cloudflareZoneId,
        domain,
        dkimTokens
      );
      dnsProvisionedAutomatically = dnsResult.success;
      dnsAddedCount = dnsResult.addedCount;
      if (!dnsResult.success) {
        dnsWarning = dnsResult.error;
      }
    }

    await adminDb.collection('organizations').doc(orgId).update({
      mailServiceActive: true,
      mailMonthlyLimit: orgData.mailMonthlyLimit ?? 1000,
      mailDailyLimit: orgData.mailDailyLimit ?? 100,
      mailMonthlySent: orgData.mailMonthlySent ?? 0,
      mailDailySent: orgData.mailDailySent ?? 0,
      mailCatchAllUserId: orgData.mailCatchAllUserId ?? null,
      mailCatchAllEmail: orgData.mailCatchAllEmail ?? null,
      mailActivatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      data: {
        dnsProvisionedAutomatically,
        dnsAddedCount,
        dnsWarning,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to activate Email Service.' };
  }
}

export async function deactivateMailService(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    await adminDb.collection('organizations').doc(orgId).update({
      mailServiceActive: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to deactivate Email Service.' };
  }
}

export async function syncMailDnsRecords(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { orgData } = await verifyUserOrgAccess(idToken, orgId);
    if (!orgData.cloudflareZoneId) {
      return {
        success: false,
        error: 'DNS Management is not active on this organization. Add the records manually at your domain registrar or activate DNS Management first.',
      };
    }

    const domain = (orgData.domain || '').toLowerCase().trim();
    const dkimTokens = await ensureOrgDkimTokens(orgId, orgData);
    const result = await provisionRequiredDnsRecordsOnZone(
      idToken,
      orgId,
      orgData.cloudflareZoneId,
      domain,
      dkimTokens
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: { addedCount: result.addedCount },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to synchronize DNS records.' };
  }
}

export async function updateMailCatchAll(
  idToken: string,
  orgId: string,
  catchAllUserId: string | null
) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);

    let catchAllEmail: string | null = null;
    let resolvedUserId: string | null = null;

    if (catchAllUserId) {
      const userDoc = await adminDb
        .collection('organizations')
        .doc(orgId)
        .collection('mailUsers')
        .doc(catchAllUserId)
        .get();

      if (!userDoc.exists) {
        return { success: false, error: 'Selected fallback account does not exist.' };
      }
      const userData = userDoc.data()!;
      if (userData.status !== 'active') {
        return { success: false, error: 'Catch-all target must be an active email account.' };
      }
      resolvedUserId = userDoc.id;
      catchAllEmail = userData.primaryEmail;
    }

    await adminDb.collection('organizations').doc(orgId).update({
      mailCatchAllUserId: resolvedUserId,
      mailCatchAllEmail: catchAllEmail,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      data: {
        catchAllUserId: resolvedUserId,
        catchAllEmail,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update Catch-All routing.' };
  }
}

// ============================================================================
// ORGANIZATIONAL UNITS (OUs)
// ============================================================================

export async function listMailOrgUnits(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    const snap = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailOrgUnits')
      .orderBy('name', 'asc')
      .get();

    const units: MailOrgUnit[] = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name || '',
        path: d.path || `/${d.name || ''}`,
        description: d.description || '',
        createdAt: d.createdAt || new Date().toISOString(),
      };
    });

    return { success: true, data: units };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load Organizational Units.' };
  }
}

export async function createMailOrgUnit(
  idToken: string,
  orgId: string,
  payload: { name: string; description?: string }
) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    const cleanName = (payload.name || '').trim().replace(/^\/+|\/+$/g, '');
    if (!cleanName) {
      return { success: false, error: 'Organizational Unit name is required.' };
    }

    const ouPath = `/${cleanName}`;
    const colRef = adminDb.collection('organizations').doc(orgId).collection('mailOrgUnits');
    const existing = await colRef.where('path', '==', ouPath).get();
    if (!existing.empty) {
      return { success: false, error: `Organizational Unit "${ouPath}" already exists.` };
    }

    const now = new Date().toISOString();
    const docRef = await colRef.add({
      name: cleanName,
      path: ouPath,
      description: (payload.description || '').trim(),
      createdAt: now,
    });

    return {
      success: true,
      data: {
        id: docRef.id,
        name: cleanName,
        path: ouPath,
        description: (payload.description || '').trim(),
        createdAt: now,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create Organizational Unit.' };
  }
}

export async function deleteMailOrgUnit(idToken: string, orgId: string, ouId: string) {
  if (!orgId || !ouId) return { success: false, error: 'Missing parameters.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    const ouRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailOrgUnits')
      .doc(ouId);

    const ouDoc = await ouRef.get();
    if (!ouDoc.exists) {
      return { success: false, error: 'Organizational Unit not found.' };
    }

    const ouPath = ouDoc.data()?.path;

    // Reassign any users or groups in this OU back to "/"
    if (ouPath) {
      const usersSnap = await adminDb
        .collection('organizations')
        .doc(orgId)
        .collection('mailUsers')
        .where('orgUnitPath', '==', ouPath)
        .get();

      const batch = adminDb.batch();
      usersSnap.docs.forEach((uDoc) => {
        batch.update(uDoc.ref, { orgUnitPath: '/' });
      });

      const groupsSnap = await adminDb
        .collection('organizations')
        .doc(orgId)
        .collection('mailGroups')
        .where('orgUnitPath', '==', ouPath)
        .get();

      groupsSnap.docs.forEach((gDoc) => {
        batch.update(gDoc.ref, { orgUnitPath: '/' });
      });

      batch.delete(ouRef);
      await batch.commit();
    } else {
      await ouRef.delete();
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete Organizational Unit.' };
  }
}

// ============================================================================
// USERS DIRECTORY, ALIASES, SUSPENSION & 14-DAY DELETION RECOVERY
// ============================================================================

async function isEmailAddressTakenInOrg(
  orgId: string,
  candidateEmail: string,
  excludeUserId?: string,
  excludeGroupId?: string
): Promise<string | null> {
  const normalized = candidateEmail.toLowerCase().trim();

  const usersSnap = await adminDb
    .collection('organizations')
    .doc(orgId)
    .collection('mailUsers')
    .get();

  for (const doc of usersSnap.docs) {
    if (excludeUserId && doc.id === excludeUserId) continue;
    const d = doc.data();
    // Skip permanently expired deleted accounts
    if (d.status === 'deleted' && d.recoverableUntil) {
      if (new Date(d.recoverableUntil).getTime() <= Date.now()) {
        continue;
      }
    }
    if ((d.primaryEmail || '').toLowerCase() === normalized) {
      return `Address "${normalized}" is already assigned as a primary email account.`;
    }
    const aliases: string[] = Array.isArray(d.aliases) ? d.aliases : [];
    if (aliases.some((a) => a.toLowerCase() === normalized)) {
      return `Address "${normalized}" is already assigned as an email alias.`;
    }
  }

  const groupsSnap = await adminDb
    .collection('organizations')
    .doc(orgId)
    .collection('mailGroups')
    .get();

  for (const doc of groupsSnap.docs) {
    if (excludeGroupId && doc.id === excludeGroupId) continue;
    const d = doc.data();
    if ((d.groupEmail || '').toLowerCase() === normalized) {
      return `Address "${normalized}" is already used by a group address.`;
    }
  }

  return null;
}

export async function listMailUsers(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    const colRef = adminDb.collection('organizations').doc(orgId).collection('mailUsers');
    const snap = await colRef.get();

    const nowMs = Date.now();
    const expiredDocs: FirebaseFirestore.DocumentReference[] = [];
    const users: MailUserRecord[] = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.status === 'deleted' && d.recoverableUntil) {
        const expiryMs = new Date(d.recoverableUntil).getTime();
        if (expiryMs <= nowMs) {
          expiredDocs.push(doc.ref);
          continue;
        }
      }

      users.push({
        id: doc.id,
        firstName: d.firstName || '',
        lastName: d.lastName || '',
        displayName: d.displayName || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
        primaryEmail: d.primaryEmail || '',
        aliases: Array.isArray(d.aliases) ? d.aliases : [],
        orgUnitPath: d.orgUnitPath || '/',
        status: d.status || 'active',
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt || new Date().toISOString(),
        deletedAt: d.deletedAt || null,
        recoverableUntil: d.recoverableUntil || null,
      });
    }

    if (expiredDocs.length > 0) {
      const batch = adminDb.batch();
      expiredDocs.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    users.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return { success: true, data: users };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to list email accounts.' };
  }
}

export async function createMailUser(
  idToken: string,
  orgId: string,
  payload: {
    firstName: string;
    lastName: string;
    emailPrefix: string;
    password: string;
    orgUnitPath?: string;
  }
) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { orgData } = await verifyUserOrgAccess(idToken, orgId);
    const domain = (orgData.domain || '').toLowerCase().trim();
    if (!domain) {
      return { success: false, error: 'Organization domain is not configured.' };
    }

    const firstName = (payload.firstName || '').trim();
    const lastName = (payload.lastName || '').trim();
    if (!firstName) {
      return { success: false, error: 'First name is required.' };
    }

    const prefix = (payload.emailPrefix || '')
      .toLowerCase()
      .trim()
      .replace(/@.*$/, '');
    if (!prefix || !/^[a-z0-9._-]+$/.test(prefix)) {
      return {
        success: false,
        error: 'Enter a valid email username (letters, numbers, dots, hyphens, underscores).',
      };
    }

    if (!payload.password || payload.password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long.' };
    }

    const primaryEmail = `${prefix}@${domain}`;
    const conflictError = await isEmailAddressTakenInOrg(orgId, primaryEmail);
    if (conflictError) {
      return { success: false, error: conflictError };
    }

    const displayName = `${firstName} ${lastName}`.trim();
    const orgUnitPath = (payload.orgUnitPath || '/').trim() || '/';
    const now = new Date().toISOString();

    const docRef = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUsers')
      .add({
        firstName,
        lastName,
        displayName,
        primaryEmail,
        passwordHash: hashMailPassword(payload.password),
        aliases: [],
        orgUnitPath,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        recoverableUntil: null,
      });

    return {
      success: true,
      data: {
        id: docRef.id,
        firstName,
        lastName,
        displayName,
        primaryEmail,
        aliases: [],
        orgUnitPath,
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        recoverableUntil: null,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create email account.' };
  }
}

export async function updateMailUserAccount(
  idToken: string,
  orgId: string,
  userId: string,
  payload: { firstName: string; lastName: string; orgUnitPath?: string }
) {
  if (!orgId || !userId) return { success: false, error: 'Missing parameters.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    const firstName = (payload.firstName || '').trim();
    const lastName = (payload.lastName || '').trim();
    if (!firstName) {
      return { success: false, error: 'First name is required.' };
    }

    const userRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUsers')
      .doc(userId);

    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return { success: false, error: 'Email account not found.' };
    }

    const displayName = `${firstName} ${lastName}`.trim();
    const orgUnitPath = payload.orgUnitPath
      ? payload.orgUnitPath.trim()
      : userDoc.data()?.orgUnitPath || '/';
    const updatedAt = new Date().toISOString();

    await userRef.update({
      firstName,
      lastName,
      displayName,
      orgUnitPath,
      updatedAt,
    });

    return {
      success: true,
      data: { firstName, lastName, displayName, orgUnitPath, updatedAt },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update account details.' };
  }
}

export async function resetMailUserPassword(
  idToken: string,
  orgId: string,
  userId: string,
  newPassword: string
) {
  if (!orgId || !userId) return { success: false, error: 'Missing parameters.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters long.' };
    }

    const userRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUsers')
      .doc(userId);

    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return { success: false, error: 'Email account not found.' };
    }

    await userRef.update({
      passwordHash: hashMailPassword(newPassword),
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to reset password.' };
  }
}

export async function manageMailUserAlias(
  idToken: string,
  orgId: string,
  userId: string,
  action: 'add' | 'update' | 'remove',
  payload: { aliasPrefix?: string; targetAlias?: string; updatedAliasPrefix?: string }
) {
  if (!orgId || !userId) return { success: false, error: 'Missing parameters.' };
  try {
    const { orgData } = await verifyUserOrgAccess(idToken, orgId);
    const domain = (orgData.domain || '').toLowerCase().trim();
    if (!domain) {
      return { success: false, error: 'Organization domain is not configured.' };
    }

    const userRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUsers')
      .doc(userId);

    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return { success: false, error: 'Email account not found.' };
    }

    const userData = userDoc.data()!;
    const currentAliases: string[] = Array.isArray(userData.aliases) ? [...userData.aliases] : [];

    if (action === 'add') {
      const prefix = (payload.aliasPrefix || '')
        .toLowerCase()
        .trim()
        .replace(/@.*$/, '');
      if (!prefix || !/^[a-z0-9._-]+$/.test(prefix)) {
        return {
          success: false,
          error: 'Enter a valid alias username (letters, numbers, dots, hyphens, underscores).',
        };
      }
      const newAlias = `${prefix}@${domain}`;
      const conflict = await isEmailAddressTakenInOrg(orgId, newAlias);
      if (conflict) {
        return { success: false, error: conflict };
      }
      currentAliases.push(newAlias);
    } else if (action === 'update') {
      const oldAlias = (payload.targetAlias || '').toLowerCase().trim();
      const idx = currentAliases.findIndex((a) => a.toLowerCase() === oldAlias);
      if (idx === -1) {
        return { success: false, error: 'Alias to update was not found on this user.' };
      }
      const newPrefix = (payload.updatedAliasPrefix || '')
        .toLowerCase()
        .trim()
        .replace(/@.*$/, '');
      if (!newPrefix || !/^[a-z0-9._-]+$/.test(newPrefix)) {
        return {
          success: false,
          error: 'Enter a valid alias username (letters, numbers, dots, hyphens, underscores).',
        };
      }
      const updatedAlias = `${newPrefix}@${domain}`;
      if (updatedAlias !== oldAlias) {
        const conflict = await isEmailAddressTakenInOrg(orgId, updatedAlias);
        if (conflict) {
          return { success: false, error: conflict };
        }
        currentAliases[idx] = updatedAlias;
      }
    } else if (action === 'remove') {
      const target = (payload.targetAlias || '').toLowerCase().trim();
      const filtered = currentAliases.filter((a) => a.toLowerCase() !== target);
      currentAliases.length = 0;
      currentAliases.push(...filtered);
    }

    const updatedAt = new Date().toISOString();
    await userRef.update({
      aliases: currentAliases,
      updatedAt,
    });

    return {
      success: true,
      data: { aliases: currentAliases, updatedAt },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update email aliases.' };
  }
}

export async function toggleMailUserSuspend(
  idToken: string,
  orgId: string,
  userId: string,
  suspend: boolean
) {
  if (!orgId || !userId) return { success: false, error: 'Missing parameters.' };
  try {
    const { orgData } = await verifyUserOrgAccess(idToken, orgId);
    const userRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUsers')
      .doc(userId);

    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return { success: false, error: 'Email account not found.' };
    }

    const nextStatus = suspend ? 'suspended' : 'active';
    const updatedAt = new Date().toISOString();

    await userRef.update({
      status: nextStatus,
      updatedAt,
    });

    // If this account was the catch-all fallback and is now suspended, clear catch-all
    if (suspend && orgData.mailCatchAllUserId === userId) {
      await adminDb.collection('organizations').doc(orgId).update({
        mailCatchAllUserId: null,
        mailCatchAllEmail: null,
      });
    }

    return {
      success: true,
      data: { status: nextStatus, updatedAt },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update account suspension status.' };
  }
}

export async function deleteMailUserAccount(idToken: string, orgId: string, userId: string) {
  if (!orgId || !userId) return { success: false, error: 'Missing parameters.' };
  try {
    const { orgData } = await verifyUserOrgAccess(idToken, orgId);
    const userRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUsers')
      .doc(userId);

    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return { success: false, error: 'Email account not found.' };
    }

    const nowMs = Date.now();
    const deletedAt = new Date(nowMs).toISOString();
    const recoverableUntil = new Date(nowMs + FOURTEEN_DAYS_MS).toISOString();

    await userRef.update({
      status: 'deleted',
      deletedAt,
      recoverableUntil,
      updatedAt: deletedAt,
    });

    if (orgData.mailCatchAllUserId === userId) {
      await adminDb.collection('organizations').doc(orgId).update({
        mailCatchAllUserId: null,
        mailCatchAllEmail: null,
      });
    }

    return {
      success: true,
      data: {
        status: 'deleted' as const,
        deletedAt,
        recoverableUntil,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete email account.' };
  }
}

export async function recoverMailUserAccount(idToken: string, orgId: string, userId: string) {
  if (!orgId || !userId) return { success: false, error: 'Missing parameters.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    const userRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUsers')
      .doc(userId);

    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return { success: false, error: 'Account is no longer available for recovery.' };
    }

    const data = userDoc.data()!;
    if (data.recoverableUntil && new Date(data.recoverableUntil).getTime() <= Date.now()) {
      await userRef.delete();
      return { success: false, error: 'The 14-day recovery window for this account has expired.' };
    }

    const updatedAt = new Date().toISOString();
    await userRef.update({
      status: 'active',
      deletedAt: null,
      recoverableUntil: null,
      updatedAt,
    });

    return {
      success: true,
      data: {
        status: 'active' as const,
        deletedAt: null,
        recoverableUntil: null,
        updatedAt,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to recover email account.' };
  }
}

// ============================================================================
// GROUPS DIRECTORY
// ============================================================================

export async function listMailGroups(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    const snap = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailGroups')
      .get();

    const groups: MailGroupRecord[] = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name || '',
        groupEmail: d.groupEmail || '',
        orgUnitPath: d.orgUnitPath || '/',
        memberEmails: Array.isArray(d.memberEmails) ? d.memberEmails : [],
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt || new Date().toISOString(),
      };
    });

    groups.sort((a, b) => a.name.localeCompare(b.name));
    return { success: true, data: groups };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to list groups.' };
  }
}

export async function createMailGroup(
  idToken: string,
  orgId: string,
  payload: {
    name: string;
    emailPrefix: string;
    orgUnitPath?: string;
    memberEmails?: string[];
  }
) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { orgData } = await verifyUserOrgAccess(idToken, orgId);
    const domain = (orgData.domain || '').toLowerCase().trim();
    if (!domain) {
      return { success: false, error: 'Organization domain is not configured.' };
    }

    const name = (payload.name || '').trim();
    if (!name) {
      return { success: false, error: 'Group name is required.' };
    }

    const prefix = (payload.emailPrefix || '')
      .toLowerCase()
      .trim()
      .replace(/@.*$/, '');
    if (!prefix || !/^[a-z0-9._-]+$/.test(prefix)) {
      return {
        success: false,
        error: 'Enter a valid group address prefix (letters, numbers, dots, hyphens, underscores).',
      };
    }

    const groupEmail = `${prefix}@${domain}`;
    const conflict = await isEmailAddressTakenInOrg(orgId, groupEmail);
    if (conflict) {
      return { success: false, error: conflict };
    }

    const orgUnitPath = (payload.orgUnitPath || '/').trim() || '/';
    const memberEmails = Array.from(
      new Set(
        (payload.memberEmails || [])
          .map((m) => m.toLowerCase().trim())
          .filter((m) => m.includes('@'))
      )
    );
    const now = new Date().toISOString();

    const docRef = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailGroups')
      .add({
        name,
        groupEmail,
        orgUnitPath,
        memberEmails,
        createdAt: now,
        updatedAt: now,
      });

    return {
      success: true,
      data: {
        id: docRef.id,
        name,
        groupEmail,
        orgUnitPath,
        memberEmails,
        createdAt: now,
        updatedAt: now,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create group.' };
  }
}

export async function updateMailGroup(
  idToken: string,
  orgId: string,
  groupId: string,
  payload: {
    name?: string;
    orgUnitPath?: string;
    memberEmails?: string[];
  }
) {
  if (!orgId || !groupId) return { success: false, error: 'Missing parameters.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    const groupRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailGroups')
      .doc(groupId);

    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) {
      return { success: false, error: 'Group not found.' };
    }

    const current = groupDoc.data()!;
    const name = payload.name !== undefined ? payload.name.trim() : current.name;
    if (!name) {
      return { success: false, error: 'Group name cannot be empty.' };
    }

    const orgUnitPath =
      payload.orgUnitPath !== undefined ? payload.orgUnitPath.trim() || '/' : current.orgUnitPath || '/';

    const memberEmails =
      payload.memberEmails !== undefined
        ? Array.from(
            new Set(
              payload.memberEmails
                .map((m) => m.toLowerCase().trim())
                .filter((m) => m.includes('@'))
            )
          )
        : Array.isArray(current.memberEmails)
        ? current.memberEmails
        : [];

    const updatedAt = new Date().toISOString();
    await groupRef.update({
      name,
      orgUnitPath,
      memberEmails,
      updatedAt,
    });

    return {
      success: true,
      data: {
        id: groupId,
        name,
        groupEmail: current.groupEmail,
        orgUnitPath,
        memberEmails,
        updatedAt,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update group.' };
  }
}

export async function deleteMailGroup(idToken: string, orgId: string, groupId: string) {
  if (!orgId || !groupId) return { success: false, error: 'Missing parameters.' };
  try {
    await verifyUserOrgAccess(idToken, orgId);
    await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailGroups')
      .doc(groupId)
      .delete();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete group.' };
  }
}
