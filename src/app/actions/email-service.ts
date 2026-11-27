'use server';

import crypto from 'crypto';
import dns from 'dns';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { assertStepUpMfa, hasOrgPermission, verifyUserOrgAccess } from './auth-helper';
import {
  listDNSRecords,
  createDNSRecord,
  deleteDNSRecord,
} from './dns-service';
import { validateAndSanitizeInput, stripScripts } from '@/lib/security/sanitize';
import { hashMailPassword, hashMailPasswordAsync } from '@/lib/security/mail-crypto';
import { encryptToken, decryptToken } from '@/lib/security/encryption';
import {
  assertActiveMailDomainBinding,
  isEmailAddressTakenInOrg,
  logMailAuditEvent,
  callStalwartJmap,
  dispatchStalwartApi,
  ensureStalwartDomainId,
  syncStalwartDomainPrincipal,
  syncStalwartUserPrincipal,
  calculateRollingQuota,
} from '@/lib/mail-internal';
import {
  callAwsSesV2Api,
  resolveOrganizationOwnerEmail,
  sendRevletAlertEmail,
} from '@/lib/revlet-alerts';

const dnsPromises = dns.promises;

export interface MailRequiredDnsRecord {
  id: string;
  purpose: string;
  type: 'MX' | 'TXT' | 'CNAME';
  name: string;
  content: string;
  priority?: number;
  ttl: string;
  verified: boolean;
  required?: boolean;
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

// ============================================================================
// CONSTANTS & SECURITY LIMITS
// ============================================================================

function toIsoSafe(val: any, fallback = new Date().toISOString()): string {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return fallback;
    }
  }
  if (typeof val._seconds === 'number') {
    return new Date(val._seconds * 1000).toISOString();
  }
  if (typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return fallback;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ORG_UNITS_PER_ORG = 50;
const MAX_ALIASES_PER_USER = 25;
const MAX_MEMBERS_PER_GROUP = 500;
const MAX_MAILBOXES_PER_ORG = 1000;

const MAIL_MX_HOST = (process.env.MAIL_MX_HOST || 'mx.revlet.me').toLowerCase().trim();
const MAIL_SPF_INCLUDE = (process.env.MAIL_SPF_INCLUDE || '_spf.mx.revlet.me').toLowerCase().trim();
const MAIL_DKIM_TARGET_DOMAIN = (
  process.env.MAIL_DKIM_TARGET_DOMAIN || 'dkim.revlet.me'
)
  .toLowerCase()
  .trim();

// ============================================================================
// CRYPTOGRAPHIC PASSWORD HASHING & INPUT VALIDATION
// ============================================================================

function validateMailPassword(password: string): string | null {
  if (!password || typeof password !== 'string') {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (password.length > 128) {
    return 'Password must not exceed 128 characters.';
  }
  if (!/[A-Za-z]/.test(password) || !/[\d\W_]/.test(password)) {
    return 'Password must include at least one letter and one number or symbol.';
  }
  return null;
}

function validateEmailLocalPart(
  rawInput: string,
  fieldLabel = 'Email username'
): { valid: boolean; prefix: string; error?: string } {
  const prefix = (rawInput || '')
    .toLowerCase()
    .trim()
    .replace(/@.*$/, '');

  if (!prefix) {
    return { valid: false, prefix: '', error: `${fieldLabel} is required.` };
  }
  if (prefix.length > 64) {
    return { valid: false, prefix, error: `${fieldLabel} cannot exceed 64 characters.` };
  }
  if (
    !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(prefix) ||
    prefix.includes('..')
  ) {
    return {
      valid: false,
      prefix,
      error: `Enter a valid ${fieldLabel.toLowerCase()} (letters, numbers, dots, hyphens, underscores; cannot start or end with punctuation or contain consecutive dots).`,
    };
  }
  return { valid: true, prefix };
}

function isValidEmailAddress(email: string): boolean {
  if (!email || typeof email !== 'string' || email.length > 254) return false;
  return /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    email.trim()
  );
}

// Stalwart JMAP and audit logging helpers moved to @/lib/mail-internal

async function syncStalwartGroupPrincipal(params: {
  groupEmail: string;
  name: string;
  memberEmails: string[];
  isCreate?: boolean;
}) {
  const cleanEmail = params.groupEmail.toLowerCase().trim();
  const [localPart, domainPart] = cleanEmail.split('@');
  if (!localPart || !domainPart) return;

  const domainId = await ensureStalwartDomainId(domainPart);
  if (!domainId) return;

  const mlResponses = await callStalwartJmap([
    ['x:MailingList/get', { accountId: 'b', ids: null }, 'mlList'],
  ]);
  const mlList: any[] = mlResponses.find((r) => r[0] === 'x:MailingList/get')?.[1]?.list || [];
  const existingMl = mlList.find(
    (m) => (m.emailAddress || '').toLowerCase() === cleanEmail
  );

  const recipientsEntries = new Map<string, boolean>();
  for (const member of params.memberEmails || []) {
    const cleanMem = member.toLowerCase().trim();
    if (cleanMem && cleanMem !== '__proto__' && cleanMem !== 'constructor' && cleanMem !== 'prototype') {
      recipientsEntries.set(cleanMem, true);
    }
  }
  const recipientsMap: Record<string, boolean> = Object.fromEntries(recipientsEntries);

  if (!existingMl) {
    await callStalwartJmap([
      [
        'x:MailingList/set',
        {
          accountId: 'b',
          create: {
            ml0: {
              name: localPart,
              domainId,
              description: params.name || localPart,
              recipients: recipientsMap,
            },
          },
        },
        'createMl',
      ],
    ]);
  } else {
    await callStalwartJmap([
      [
        'x:MailingList/set',
        {
          accountId: 'b',
          update: {
            [existingMl.id]: {
              description: params.name || existingMl.description || localPart,
              recipients: recipientsMap,
            },
          },
        },
        'updMl',
      ],
    ]);
  }
}

// ============================================================================
// AUTOMATED AWS SES v2 DOMAIN IDENTITY PROVISIONING (AWS SIGV4)
// Automatically registers client domains in AWS SES and retrieves Easy DKIM tokens
// so the platform owner never has to add client domains manually in the AWS Console.
// ============================================================================

interface OrgDkimConfig {
  mode: 'byodkim' | 'easydkim';
  selector: string;
  publicKey: string;
  tokens: string[];
}

async function provisionAwsSesByoDkim(
  orgId: string,
  domain: string,
  selector: string,
  privateKeyB64: string,
  legacyProvisioned: boolean
): Promise<boolean> {
  const identityPath = `/v2/email/identities/${encodeURIComponent(domain)}`;
  const binding = adminDb.collection('mailDomainBindings').doc(domain);
  const bindingData = (await binding.get()).data();
  if (bindingData?.orgId !== orgId) {
    throw new Error('The domain is not bound to this organization.');
  }

  const existing = await callAwsSesV2Api('GET', identityPath);
  if (existing.ok) {
    if (!bindingData.sesIdentityCreated && !legacyProvisioned) {
      throw new Error('A sending identity already exists for this domain. Contact support to verify its ownership.');
    }
    // Existing identities require a separate, reviewed migration to change signing keys.
    return existing.data?.DkimAttributes?.SigningAttributesOrigin === 'EXTERNAL'
      && existing.data?.VerifiedForSendingStatus === true
      && existing.data?.DkimAttributes?.Status === 'SUCCESS';
  }
  if (existing.status !== 404) return false;

  const created = await callAwsSesV2Api('POST', '/v2/email/identities', {
    EmailIdentity: domain,
    ConfigurationSetName: 'revlet-ses-cfg-default',
    DkimSigningAttributes: {
      DomainSigningSelector: selector,
      DomainSigningPrivateKey: privateKeyB64,
      DomainSigningAttributesOrigin: 'EXTERNAL',
    },
  });
  if (created.ok) {
    await binding.update({ sesIdentityCreated: true });
  } else {
    console.error('[BYODKIM] Could not create sending identity:', { domain, status: created.status });
  }
  // The next activation check can confirm the provider has verified the new identity.
  return false;
}

// ============================================================================
// DNS RECORDS & LIVE PUBLIC DNS VERIFICATION
// ============================================================================

const PUBLIC_DNS_CACHE_TTL_MS = 60_000;
const publicDnsCache = new Map<
  string,
  { records: Array<{ type: string; name: string; content: string; priority?: number }>; expiresAt: number }
>();

/**
 * Resolves live public DNS records (MX, TXT, _dmarc TXT, and DKIM CNAMEs)
 * when an organization manages DNS at an external registrar outside Cloudflare.
 * Uses a 60s in-memory TTL cache to avoid redundant DNS queries & serverless CPU usage.
 */
async function resolvePublicDnsRecords(
  domain: string,
  dkimConfig: OrgDkimConfig,
  bypassCache = false
): Promise<Array<{ type: string; name: string; content: string; priority?: number }>> {
  const normalizedDomain = domain.toLowerCase().trim().replace(/\.$/, '');
  if (!normalizedDomain) return [];

  const cacheKey =
    dkimConfig.mode === 'byodkim'
      ? `${normalizedDomain}:byodkim:${dkimConfig.selector}:${dkimConfig.publicKey}`
      : `${normalizedDomain}:${dkimConfig.tokens.slice(0, 3).join(',')}`;
  if (!bypassCache) {
    const cached = publicDnsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.records;
    }
  }

  const records: Array<{ type: string; name: string; content: string; priority?: number }> = [];

  const withTimeout = <T>(promise: Promise<T>, ms = 2500): Promise<T | null> =>
    Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]).catch(() => null);

  if (dkimConfig.mode === 'byodkim') {
    const dkimName = `${dkimConfig.selector}._domainkey.${normalizedDomain}`;
    const [mxRes, txtRes, dmarcRes, dkimTxtRes] = await Promise.all([
      withTimeout(dnsPromises.resolveMx(normalizedDomain)),
      withTimeout(dnsPromises.resolveTxt(normalizedDomain)),
      withTimeout(dnsPromises.resolveTxt(`_dmarc.${normalizedDomain}`)),
      withTimeout(dnsPromises.resolveTxt(dkimName)),
    ]);

    if (Array.isArray(mxRes)) {
      for (const mx of mxRes) {
        records.push({ type: 'MX', name: normalizedDomain, content: mx.exchange, priority: mx.priority });
      }
    }
    if (Array.isArray(txtRes)) {
      for (const chunks of txtRes) {
        records.push({ type: 'TXT', name: normalizedDomain, content: chunks.join('') });
      }
    }
    if (Array.isArray(dmarcRes)) {
      for (const chunks of dmarcRes) {
        records.push({ type: 'TXT', name: `_dmarc.${normalizedDomain}`, content: chunks.join('') });
      }
    }
    if (Array.isArray(dkimTxtRes)) {
      for (const chunks of dkimTxtRes) {
        records.push({ type: 'TXT', name: dkimName, content: chunks.join('') });
      }
    }

    publicDnsCache.set(cacheKey, { records, expiresAt: Date.now() + PUBLIC_DNS_CACHE_TTL_MS });
    return records;
  }

  const [mxRes, txtRes, dmarcRes, ...cnameResults] = await Promise.all([
    withTimeout(dnsPromises.resolveMx(normalizedDomain)),
    withTimeout(dnsPromises.resolveTxt(normalizedDomain)),
    withTimeout(dnsPromises.resolveTxt(`_dmarc.${normalizedDomain}`)),
    ...dkimConfig.tokens.slice(0, 3).map((token) =>
      withTimeout(dnsPromises.resolveCname(`${token}._domainkey.${normalizedDomain}`))
    ),
  ]);

  if (Array.isArray(mxRes)) {
    for (const mx of mxRes) {
      records.push({
        type: 'MX',
        name: normalizedDomain,
        content: mx.exchange,
        priority: mx.priority,
      });
    }
  }

  if (Array.isArray(txtRes)) {
    for (const chunks of txtRes) {
      records.push({
        type: 'TXT',
        name: normalizedDomain,
        content: chunks.join(''),
      });
    }
  }

  if (Array.isArray(dmarcRes)) {
    for (const chunks of dmarcRes) {
      records.push({
        type: 'TXT',
        name: `_dmarc.${normalizedDomain}`,
        content: chunks.join(''),
      });
    }
  }

  dkimConfig.tokens.slice(0, 3).forEach((token, idx) => {
    const cnames = cnameResults[idx];
    if (Array.isArray(cnames)) {
      for (const target of cnames) {
        records.push({
          type: 'CNAME',
          name: `${token}._domainkey.${normalizedDomain}`,
          content: target,
        });
      }
    }
  });

  publicDnsCache.set(cacheKey, {
    records,
    expiresAt: Date.now() + PUBLIC_DNS_CACHE_TTL_MS,
  });

  return records;
}

function buildRequiredDnsRecords(
  domain: string,
  dkimConfig: OrgDkimConfig,
  liveRecords: Array<{ type: string; name: string; content: string; priority?: number }> = []
): MailRequiredDnsRecord[] {
  const normalizedDomain = domain.toLowerCase().trim().replace(/\.$/, '');

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
      return type === 'TXT' ? rContent.includes(cleanExpectedContent) : rContent === cleanExpectedContent;
    });
  };

  // Core Required Record 1: Inbound MX
  const coreRecords: MailRequiredDnsRecord[] = [
    {
      id: 'mx-primary',
      purpose: 'Inbound Mail Routing (MX)',
      type: 'MX',
      name: normalizedDomain,
      content: MAIL_MX_HOST,
      priority: 10,
      ttl: 'Auto',
      verified: isPresent('MX', normalizedDomain, MAIL_MX_HOST) && !hasOtherMailProvider(normalizedDomain, liveRecords),
      required: true,
    },
  ];

  // Core Required Record 2: Outbound DKIM (BYODKIM single TXT or EasyDKIM CNAMEs)
  if (dkimConfig.mode === 'byodkim') {
    const recordName = `${dkimConfig.selector}._domainkey.${normalizedDomain}`;
    const recordContent = `v=DKIM1; k=rsa; p=${dkimConfig.publicKey}`;
    const selectorTxtRecords = liveRecords.filter(
      (record) =>
        record.type === 'TXT' &&
        record.name.toLowerCase().replace(/\.$/, '') === recordName.toLowerCase()
    );
    const matchesActiveDkimKey = (content: string) =>
      content.replace(/^"|"$/g, '').split(';').some((tag) => {
        const match = /^p\s*=\s*(.*)$/.exec(tag.trim());
        return match?.[1].replace(/\s/g, '') === dkimConfig.publicKey;
      });
    const hasMatchingDkim = selectorTxtRecords.some((r) => matchesActiveDkimKey(r.content));
    const hasConflictingDkim = selectorTxtRecords.some(
      (r) => /v\s*=\s*dkim1/i.test(r.content) && !matchesActiveDkimKey(r.content)
    );
    coreRecords.push({
      id: 'txt-dkim-1',
      purpose: 'Outbound Mail Signing (DKIM)',
      type: 'TXT',
      name: recordName,
      content: recordContent,
      ttl: 'Auto',
      verified: Boolean(dkimConfig.publicKey) && hasMatchingDkim && !hasConflictingDkim,
      required: true,
    });
  } else {
    dkimConfig.tokens.slice(0, 3).forEach((token, idx) => {
      const recordName = `${token}._domainkey.${normalizedDomain}`;
      const recordTarget = `${token}.${MAIL_DKIM_TARGET_DOMAIN}`;
      coreRecords.push({
        id: `cname-dkim-${idx + 1}`,
        purpose: `Domain Signing Key #${idx + 1} (DKIM)`,
        type: 'CNAME',
        name: recordName,
        content: recordTarget,
        ttl: 'Auto',
        verified:
          isPresent('CNAME', recordName, recordTarget) ||
          isPresent('CNAME', recordName, `${token}.dkim.amazonses.com`),
        required: true,
      });
    });
  }

  // Optional Deliverability Hardening Records (SPF and DMARC)
  const optionalRecords: MailRequiredDnsRecord[] = [
    {
      id: 'txt-spf',
      purpose: 'Sender Policy Authorization (SPF)',
      type: 'TXT',
      name: normalizedDomain,
      content: `v=spf1 include:${MAIL_SPF_INCLUDE} include:amazonses.com ~all`,
      ttl: 'Auto',
      verified:
        isPresent('TXT', normalizedDomain, `include:${MAIL_SPF_INCLUDE}`) ||
        isPresent('TXT', normalizedDomain, 'include:amazonses.com') ||
        isPresent('TXT', normalizedDomain, 'v=spf1 mx'),
      required: false,
    },
    {
      id: 'txt-dmarc',
      purpose: 'Domain Authentication Policy (DMARC)',
      type: 'TXT',
      name: `_dmarc.${normalizedDomain}`,
      content: 'v=DMARC1; p=quarantine; pct=100;',
      ttl: 'Auto',
      verified: isPresent('TXT', `_dmarc.${normalizedDomain}`, 'v=dmarc1'),
      required: false,
    },
  ];

  return [...coreRecords, ...optionalRecords];
}

function hasOtherMailProvider(domain: string, records: Array<{ type: string; name: string; content: string }>) {
  const expected = MAIL_MX_HOST.toLowerCase().replace(/\.$/, '');
  return records.some((record) => {
    const name = record.name.toLowerCase().replace(/\.$/, '');
    return record.type === 'MX' && (name === domain || name === '@') &&
      record.content.toLowerCase().replace(/\.$/, '') !== expected;
  });
}

function readOrgDkimConfig(orgData: FirebaseFirestore.DocumentData): OrgDkimConfig | null {
  if (orgData.mailDkimMode !== 'byodkim' && !orgData.mailDkimPublicKey &&
      Array.isArray(orgData.mailDkimTokens) && orgData.mailDkimTokens.length === 3) {
    return { mode: 'easydkim', selector: 'revlet', publicKey: '', tokens: orgData.mailDkimTokens };
  }
  if (!orgData.mailDkimPublicKey) return null;
  return {
    mode: 'byodkim',
    selector: orgData.mailDkimSelector || 'revlet',
    publicKey: orgData.mailDkimPublicKey,
    tokens: [],
  };
}

async function prepareOrgDkimConfig(orgId: string, orgData: FirebaseFirestore.DocumentData): Promise<OrgDkimConfig> {
  const configured = readOrgDkimConfig(orgData);
  if (configured) return configured;

  const orgRef = adminDb.collection('organizations').doc(orgId);
  const secretRef = orgRef.collection('privateSecrets').doc('dkim');
  const pair = await new Promise<{ publicKey: string; privateKey: string }>((resolve, reject) => {
    crypto.generateKeyPair('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    }, (error, publicKey, privateKey) => {
      if (error) reject(error);
      else resolve({ publicKey: publicKey.toString('base64'), privateKey: privateKey.toString('base64') });
    });
  });

  return adminDb.runTransaction(async (tx) => {
    const freshOrg = await tx.get(orgRef);
    if (!freshOrg.exists) throw new Error('Organization is unavailable.');
    const current = readOrgDkimConfig(freshOrg.data() || {});
    if (current) return current;
    const secret = (await tx.get(secretRef)).data();
    const selector = secret?.selector || 'revlet';
    const publicKey = secret?.publicKey || pair.publicKey;
    const hasPrivateKey = Boolean(secret?.privateKeyEncrypted?.ciphertext || secret?.privateKey);
    if (!secret?.publicKey || !hasPrivateKey) {
      if (secret?.publicKey || hasPrivateKey) throw new Error('Domain signing configuration needs repair.');
      tx.set(secretRef, {
        publicKey: pair.publicKey,
        privateKeyEncrypted: encryptToken(pair.privateKey),
        selector,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.update(orgRef, { mailDkimSelector: selector, mailDkimPublicKey: publicKey });
    return { mode: 'byodkim', selector, publicKey, tokens: [] };
  });
}

async function claimMailDomain(orgId: string, domain: string) {
  const binding = adminDb.collection('mailDomainBindings').doc(domain);
  const organizations = adminDb.collection('organizations').where('domain', '==', domain);
  await adminDb.runTransaction(async (tx) => {
    const current = await tx.get(binding);
    if (current.exists && current.data()?.orgId !== orgId) {
      throw new Error('This domain is already connected to another organization.');
    }
    const matching = await tx.get(organizations);
    if (matching.docs.some((doc) => doc.id !== orgId && doc.data().mailServiceActive === true)) {
      throw new Error('This domain is already connected to another organization.');
    }
    if (!current.exists) tx.create(binding, { orgId, createdAt: FieldValue.serverTimestamp() });
  });
}

async function provisionRequiredDnsRecordsOnZone(
  idToken: string,
  orgId: string,
  zoneId: string,
  domainName: string,
  dkimConfig: OrgDkimConfig
): Promise<{ success: boolean; addedCount: number; error?: string }> {
  try {
    const existingRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!existingRes.success) {
      return {
        success: false,
        addedCount: 0,
        error: existingRes.error || 'Could not inspect domain records.',
      };
    }

    const currentRecords: any[] = existingRes.data || [];
    const normalizedDomain = domainName.toLowerCase().replace(/\.$/, '').trim();
    if (hasOtherMailProvider(normalizedDomain, currentRecords)) {
      return { success: false, addedCount: 0, error: 'Another mail provider is configured. Review the existing MX records and plan the cutover in DNS Management before publishing Revlet records.' };
    }
    let addedCount = 0;
    const failures: string[] = [];

    // Remove any stale/conflicting BYODKIM TXT records on the same selector so DKIM alignment never breaks.
    if (dkimConfig.mode === 'byodkim' && dkimConfig.publicKey) {
      const dkimRecordName = `${dkimConfig.selector}._domainkey.${normalizedDomain}`.toLowerCase();
      const staleDkimRecords = currentRecords.filter((record: any) => {
        if (record.type !== 'TXT' || !record.id) return false;
        const name = String(record.name || '').toLowerCase().replace(/\.$/, '');
        if (name !== dkimRecordName) return false;
        const content = String(record.content || '');
        const isDkimTxt = /v\s*=\s*dkim1/i.test(content);
        const matchesActive = content.replace(/^"|"$/g, '').split(';').some((tag) => {
          const match = /^p\s*=\s*(.*)$/.exec(tag.trim());
          return match?.[1].replace(/\s/g, '') === dkimConfig.publicKey;
        });
        return isDkimTxt && !matchesActive;
      });
      for (const stale of staleDkimRecords) {
        const delRes = await deleteDNSRecord(idToken, orgId, zoneId, stale.id);
        if (!delRes.success) {
          failures.push(`DELETE TXT ${dkimRecordName}: ${delRes.error || 'Delete rejected.'}`);
        }
      }
    }

    // Only add missing required entries. Existing SPF and DMARC policies remain under the DNS owner's control.
    const requiredRecords = buildRequiredDnsRecords(normalizedDomain, dkimConfig, currentRecords);

    const publishOrder = [
      ...requiredRecords.filter((record) => record.type !== 'MX'),
      ...requiredRecords.filter((record) => record.type === 'MX'),
    ];
    for (const req of publishOrder) {
      if (req.type === 'MX' && failures.length > 0) break;
      if (req.required !== false && !req.verified) {
        // Avoid duplicating an already-present active BYODKIM TXT record when only a stale sibling was removed above.
        if (req.id === 'txt-dkim-1' && dkimConfig.mode === 'byodkim' && dkimConfig.publicKey) {
          const alreadyHasActive = currentRecords.some((record: any) =>
            record.type === 'TXT' &&
            String(record.name || '').toLowerCase().replace(/\.$/, '') === req.name.toLowerCase() &&
            String(record.content || '').replace(/^"|"$/g, '').split(';').some((tag) => {
              const match = /^p\s*=\s*(.*)$/.exec(tag.trim());
              return match?.[1].replace(/\s/g, '') === dkimConfig.publicKey;
            })
          );
          if (alreadyHasActive) continue;
        }
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
        } else {
          failures.push(`${req.type} ${req.name}: ${createRes.error || 'Create rejected.'}`);
        }
      }
    }

    const finalRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!finalRes.success) {
      return { success: false, addedCount, error: 'DNS changes could not be verified at the provider. Check again before retrying.' };
    }
    const liveFinal = finalRes.data || [];
    const finalCheck = buildRequiredDnsRecords(normalizedDomain, dkimConfig, liveFinal);
    const missingRequired = finalCheck.filter((r) => r.required !== false && !r.verified);

    if (missingRequired.length > 0 || failures.length > 0) {
      const missingSummary = missingRequired.map((m) => `${m.type} ${m.name}`).join(', ');
      return {
        success: false,
        addedCount,
        error:
          failures[0] ||
          `Required mail DNS records are still missing after provisioning: ${missingSummary}`,
      };
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

// ============================================================================
// EMAIL SERVICE LIFECYCLE & ROUTING STATE
// ============================================================================

// calculateRollingQuota moved to @/lib/mail-internal

export async function resetOrgEmailQuota(
  idToken: string,
  orgId: string,
  scope: "all" | "daily" | "monthly" = "all"
) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId);
    if (!auth.isOwner && !auth.permissions.includes('Organization Admin')) {
      return { success: false, error: 'Unauthorized: Organization Owner or Organization Admin permission required to reset quotas.' };
    }
    const now = new Date();
    const currentDayKey = now.toISOString().slice(0, 10);
    const currentMonthKey = now.toISOString().slice(0, 7);

    const updatePayload: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (scope === 'all' || scope === 'daily') {
      updatePayload.mailDailySent = 0;
      updatePayload.mailHourlyBuckets = {};
      updatePayload.mailDailyBucket = currentDayKey;
    }

    if (scope === 'all' || scope === 'monthly') {
      updatePayload.mailMonthlySent = 0;
      updatePayload.mailDailyBuckets = {};
      updatePayload.mailMonthlyBucket = currentMonthKey;
    }

    await adminDb.collection('organizations').doc(orgId).update(updatePayload);

    return {
      success: true,
      data: {
        scope,
        resetAt: now.toISOString(),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to reset organization email quota.',
    };
  }
}

export async function getMailServiceState(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { orgData, permissions, isOwner } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Read', 'Email: Add', 'Email: Admin']);
    const domain = (orgData.domain || '').toLowerCase().trim();
    const dkimConfig = readOrgDkimConfig(orgData);
    const dnsServiceActive = Boolean(orgData.cloudflareZoneId);
    const liveRecords = dkimConfig && domain ? await resolvePublicDnsRecords(domain, dkimConfig) : [];
    const requiredDnsRecords = dkimConfig ? buildRequiredDnsRecords(domain, dkimConfig, liveRecords) : [];
    const rolling = await calculateRollingQuota(orgData);

    return {
      success: true,
      data: {
        mailServiceActive: Boolean(orgData.mailServiceActive),
        dnsServiceActive,
        canManageMailService: hasOrgPermission(permissions, "Email: Admin"),
        canCreateMailAccounts: hasOrgPermission(permissions, ["Email: Add", "Email: Admin"]),
        canDeactivateMailService: isOwner,
        canInviteTeamMembers: hasOrgPermission(permissions, "Org: Admin"),
        domain,
        monthlyOutboundLimit: orgData.mailMonthlyLimit ?? 1000,
        dailyOutboundLimit: orgData.mailDailyLimit ?? 100,
        monthlySentCount: rolling.monthlySentCount,
        dailySentCount: rolling.dailySentCount,
        catchAllUserId: orgData.mailCatchAllUserId || null,
        catchAllEmail: orgData.mailCatchAllEmail || null,
        mailDeactivatedAt: orgData.mailDeactivatedAt || null,
        mailPurgeScheduledAt: orgData.mailPurgeScheduledAt || null,
        requiredDnsRecords,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to load Email Service configuration.',
    };
  }
}

export async function activateMailService(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    const domain = (orgData.domain || '').toLowerCase().trim().replace(/\.$/, '');
    if (!domain) {
      return { success: false, error: 'Organization does not have a valid domain configured.' };
    }

    const dkimConfig = readOrgDkimConfig(orgData);
    if (!dkimConfig) return { success: false, error: 'Prepare DNS records before activating Email Service.' };

    const livePublic = await resolvePublicDnsRecords(domain, dkimConfig, true);
    const required = buildRequiredDnsRecords(domain, dkimConfig, livePublic).filter((record) => record.required !== false);
    if (hasOtherMailProvider(domain, livePublic)) {
      return { success: false, error: 'Another mail provider is still published in DNS. Review your MX records before activating.' };
    }
    if (!required.every((record) => record.verified)) {
      return { success: false, error: 'Public DNS has not verified the required MX and DKIM records yet. Publish them and check again.' };
    }

    await claimMailDomain(orgId, domain);
    if (dkimConfig.mode === 'byodkim') {
      const secret = (await adminDb.collection('organizations').doc(orgId).collection('privateSecrets').doc('dkim').get()).data();
      const dkimPrivateKey = secret?.privateKeyEncrypted?.ciphertext
        ? decryptToken(secret.privateKeyEncrypted)
        : secret?.privateKey;
      if (!dkimPrivateKey || secret?.publicKey !== dkimConfig.publicKey) {
        return { success: false, error: 'Domain signing configuration needs repair. Contact support before activating.' };
      }
      if (!(await provisionAwsSesByoDkim(orgId, domain, dkimConfig.selector, dkimPrivateKey, orgData.mailSesIdentityProvisioned === true))) {
        return { success: false, error: 'The sending provider has not verified this domain. Check again shortly. If verification remains pending, contact support.' };
      }
    }

    // Ensure domain principal exists on Stalwart Mail Server (disable Stalwart Auto-DKIM when SES BYODKIM signs outbound)
    await syncStalwartDomainPrincipal(domain, {
      disableAutoDkim: dkimConfig.mode === 'byodkim',
    });

    // Re-enable any active mailboxes paused during prior deactivation
    const existingUsersSnap = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUsers')
      .where('status', '==', 'active')
      .get();
    for (const uDoc of existingUsersSnap.docs) {
      const uData = uDoc.data() || {};
      if (uData.primaryEmail) {
        await syncStalwartUserPrincipal({
          primaryEmail: uData.primaryEmail,
          displayName: uData.displayName || uData.firstName || '',
          orgUnitPath: uData.orgUnitPath || '/',
          aliases: Array.isArray(uData.aliases) ? uData.aliases : [],
          domain,
          isCatchAllTarget: orgData.mailCatchAllUserId === uDoc.id,
          disabled: false,
          expectedPrincipalId: uData.stalwartAccountId || null,
        });
      }
    }

    await adminDb.collection('organizations').doc(orgId).update({
      mailServiceActive: true,
      mailLifecycleState: 'active',
      emailForwardingActive: false,
      emailRoutingActive: false,
      emailServiceActive: false,
      mailMonthlyLimit: orgData.mailMonthlyLimit ?? 1000,
      mailDailyLimit: orgData.mailDailyLimit ?? 100,
      mailMonthlySent: orgData.mailMonthlySent ?? 0,
      mailDailySent: orgData.mailDailySent ?? 0,
      mailCatchAllUserId: orgData.mailCatchAllUserId ?? null,
      mailCatchAllEmail: orgData.mailCatchAllEmail ?? null,
      mailDeactivatedAt: null,
      mailPurgeScheduledAt: null,
      mailActivatedAt: FieldValue.serverTimestamp(),
      updatedAt: new Date().toISOString(),
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_SERVICE_ACTIVATED',
      target: domain,
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to activate Email Service.' };
  }
}

export async function deactivateMailService(idToken: string, orgId: string, stepUpToken?: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { uid, email, isOwner, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    if (!isOwner) {
      return {
        success: false,
        error: 'Unauthorized: Only the organization owner can deactivate Email Service.',
      };
    }

    assertStepUpMfa(uid, stepUpToken);
    const nowMs = Date.now();
    const deactivatedAt = new Date(nowMs).toISOString();
    const purgeScheduledAt = new Date(nowMs + FOURTEEN_DAYS_MS).toISOString();
    const domain = String(orgData.domain || '').toLowerCase().replace(/\.$/, '').trim();

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const usersSnap = await orgRef.collection('mailUsers').get();

    // Immediately pause all active mailboxes at the provider boundary and fail closed if any pause fails
    const pauseFailures: string[] = [];
    for (const uDoc of usersSnap.docs) {
      const uData = uDoc.data() || {};
      if (uData.primaryEmail && domain) {
        try {
          await syncStalwartUserPrincipal({
            primaryEmail: uData.primaryEmail,
            displayName: uData.displayName || uData.firstName || '',
            orgUnitPath: uData.orgUnitPath || '/',
            aliases: Array.isArray(uData.aliases) ? uData.aliases : [],
            domain,
            isCatchAllTarget: false,
            disabled: true,
            expectedPrincipalId: uData.stalwartAccountId || null,
          });
        } catch (err: any) {
          pauseFailures.push(`${uData.primaryEmail}: ${err?.message || 'provider pause failed'}`);
        }
      }
    }
    if (pauseFailures.length > 0) {
      return {
        success: false,
        error: `Failed to pause ${pauseFailures.length} mailbox(es) on the mail server. Retry deactivation.`,
      };
    }
    for (let i = 0; i < usersSnap.docs.length; i += 400) {
      const batch = adminDb.batch();
      usersSnap.docs.slice(i, i + 400).forEach((uDoc) => {
        batch.update(uDoc.ref, {
          sessionRevokedAt: nowMs,
      sessionsRevokedAt: nowMs,
          updatedAt: deactivatedAt,
        });
      });
      await batch.commit();
    }

    await orgRef.update({
      mailServiceActive: false,
      mailLifecycleState: 'scheduled_for_deletion',
      mailDeactivatedAt: deactivatedAt,
      mailPurgeScheduledAt: purgeScheduledAt,
      mailPurgeCompletedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_SERVICE_DEACTIVATED',
      target: orgData.domain || orgId,
      metadata: { deactivatedAt, purgeScheduledAt },
    });

    return { success: true, data: { deactivatedAt, purgeScheduledAt } };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to deactivate Email Service.' };
  }
}

export async function syncMailDnsRecords(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    const domain = (orgData.domain || '').toLowerCase().trim();
    if (!domain) return { success: false, error: 'Configure a primary domain first.' };
    const dkimConfig = await prepareOrgDkimConfig(orgId, orgData);

    if (!orgData.cloudflareZoneId) {
      // Perform live DNS verification against public resolvers
      const livePublic = await resolvePublicDnsRecords(domain, dkimConfig, true);
      const verifiedRecords = buildRequiredDnsRecords(domain, dkimConfig, livePublic);
      const verifiedCount = verifiedRecords.filter((r) => r.verified).length;
      return {
        success: true,
        data: { addedCount: 0, verifiedCount, totalCount: verifiedRecords.length },
      };
    }

    const result = await provisionRequiredDnsRecordsOnZone(
      idToken,
      orgId,
      orgData.cloudflareZoneId,
      domain,
      dkimConfig
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_DNS_SYNCED',
      target: domain,
      metadata: { addedCount: result.addedCount },
    });

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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    const domain = await assertActiveMailDomainBinding(orgId, orgData);
    const previousCatchAllUserId: string | null = orgData.mailCatchAllUserId || null;

    let catchAllEmail: string | null = null;
    let resolvedUserId: string | null = null;
    let nextTargetData: FirebaseFirestore.DocumentData | null = null;

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
      nextTargetData = userData;
    }

    await adminDb.collection('organizations').doc(orgId).update({
      mailCatchAllUserId: resolvedUserId,
      mailCatchAllEmail: catchAllEmail,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Synchronize Stalwart principals if catch-all target changed
    if (previousCatchAllUserId && previousCatchAllUserId !== resolvedUserId) {
      const prevDoc = await adminDb
        .collection('organizations')
        .doc(orgId)
        .collection('mailUsers')
        .doc(previousCatchAllUserId)
        .get();
      if (prevDoc.exists) {
        const prevData = prevDoc.data()!;
        await syncStalwartUserPrincipal({
          primaryEmail: prevData.primaryEmail,
          displayName: prevData.displayName || prevData.firstName,
          orgUnitPath: prevData.orgUnitPath || '/',
          aliases: Array.isArray(prevData.aliases) ? prevData.aliases : [],
          domain,
          isCatchAllTarget: false,
          expectedPrincipalId: prevData.stalwartAccountId || null,
        });
      }
    }

    if (resolvedUserId && nextTargetData) {
      await syncStalwartUserPrincipal({
        primaryEmail: nextTargetData.primaryEmail,
        displayName: nextTargetData.displayName || nextTargetData.firstName,
        orgUnitPath: nextTargetData.orgUnitPath || '/',
        aliases: Array.isArray(nextTargetData.aliases) ? nextTargetData.aliases : [],
        domain,
        isCatchAllTarget: true,
        expectedPrincipalId: nextTargetData.stalwartAccountId || null,
      });
    }

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_CATCH_ALL_UPDATED',
      target: catchAllEmail || 'DISABLED',
      metadata: { previousCatchAllUserId, catchAllUserId: resolvedUserId },
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
    await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Read', 'Email: Add', 'Email: Admin']);
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
        createdAt: toIsoSafe(d.createdAt),
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
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);

    const nameCheck = validateAndSanitizeInput(payload.name || '', 'Organizational Unit name', {
      required: true,
      maxLength: 48,
    });
    if (!nameCheck.isValid) {
      return { success: false, error: nameCheck.error };
    }

    const cleanName = nameCheck.sanitized.replace(/^\/+|\/+$/g, '').trim();
    if (!cleanName || !/^[A-Za-z0-9 _./-]+$/.test(cleanName)) {
      return {
        success: false,
        error: 'Unit name may only contain letters, numbers, spaces, hyphens, underscores, or slashes.',
      };
    }

    const descCheck = validateAndSanitizeInput(payload.description || '', 'Description', {
      required: false,
      maxLength: 160,
    });
    if (!descCheck.isValid) {
      return { success: false, error: descCheck.error };
    }

    const ouPath = `/${cleanName}`;
    const colRef = adminDb.collection('organizations').doc(orgId).collection('mailOrgUnits');

    const allOusSnap = await colRef.get();
    if (allOusSnap.size >= MAX_ORG_UNITS_PER_ORG) {
      return {
        success: false,
        error: `Maximum limit of ${MAX_ORG_UNITS_PER_ORG} Organizational Units reached.`,
      };
    }

    const duplicate = allOusSnap.docs.some(
      (doc) => (doc.data().path || '').toLowerCase() === ouPath.toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: `Organizational Unit "${ouPath}" already exists.` };
    }

    const now = new Date().toISOString();
    const docRef = await colRef.add({
      name: cleanName,
      path: ouPath,
      description: descCheck.sanitized,
      createdAt: now,
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_OU_CREATED',
      target: ouPath,
    });

    return {
      success: true,
      data: {
        id: docRef.id,
        name: cleanName,
        path: ouPath,
        description: descCheck.sanitized,
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
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
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

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_OU_DELETED',
      target: ouPath || ouId,
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete Organizational Unit.' };
  }
}

// ============================================================================
// USERS DIRECTORY, ALIASES, SUSPENSION & 14-DAY DELETION RECOVERY
// ============================================================================

export async function listMailUsers(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Read', 'Email: Add', 'Email: Admin']);
    const colRef = adminDb.collection('organizations').doc(orgId).collection('mailUsers');
    const snap = await colRef.get();

    const nowMs = Date.now();
    const users: MailUserRecord[] = [];

    // Strictly read-only: never delete expired mailboxes or Stalwart principals during
    // a directory read. Permanent deletion is handled exclusively by the legal-hold-aware purge worker.
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.status === 'deleted' && d.recoverableUntil) {
        const expiryMs = new Date(d.recoverableUntil).getTime();
        if (!Number.isNaN(expiryMs) && expiryMs <= nowMs) {
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
        createdAt: toIsoSafe(d.createdAt),
        updatedAt: toIsoSafe(d.updatedAt),
        deletedAt: d.deletedAt ? toIsoSafe(d.deletedAt) : null,
        recoverableUntil: d.recoverableUntil ? toIsoSafe(d.recoverableUntil) : null,
      });
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Add', 'Email: Admin']);
    const domain = await assertActiveMailDomainBinding(orgId, orgData);

    const firstCheck = validateAndSanitizeInput(payload.firstName || '', 'First name', {
      required: true,
      maxLength: 64,
    });
    if (!firstCheck.isValid) {
      return { success: false, error: firstCheck.error };
    }

    const lastCheck = validateAndSanitizeInput(payload.lastName || '', 'Last name', {
      required: false,
      maxLength: 64,
    });
    if (!lastCheck.isValid) {
      return { success: false, error: lastCheck.error };
    }

    const prefixCheck = validateEmailLocalPart(payload.emailPrefix, 'Email username');
    if (!prefixCheck.valid) {
      return { success: false, error: prefixCheck.error };
    }

    const passwordError = validateMailPassword(payload.password);
    if (passwordError) {
      return { success: false, error: passwordError };
    }

    const colRef = adminDb.collection('organizations').doc(orgId).collection('mailUsers');
    const existingCountSnap = await colRef.count().get();
    if (existingCountSnap.data().count >= MAX_MAILBOXES_PER_ORG) {
      return {
        success: false,
        error: `Organization mailbox limit (${MAX_MAILBOXES_PER_ORG}) reached.`,
      };
    }

    const primaryEmail = `${prefixCheck.prefix}@${domain}`;
    const conflictError = await isEmailAddressTakenInOrg(orgId, primaryEmail);
    if (conflictError) {
      return { success: false, error: conflictError };
    }

    const firstName = firstCheck.sanitized;
    const lastName = lastCheck.sanitized;
    const displayName = `${firstName} ${lastName}`.trim();
    const orgUnitPath = stripScripts(payload.orgUnitPath || '/', { maxLength: 64 }) || '/';
    const now = new Date().toISOString();

    // Provision principal in Stalwart Mail Server first so collisions fail closed before Firestore writes
    const stalwartAccountId = await syncStalwartUserPrincipal({
      primaryEmail,
      displayName,
      orgUnitPath,
      aliases: [],
      domain,
      isCatchAllTarget: false,
      plainPassword: payload.password,
      isCreate: true,
    });

    const docRef = await colRef.add({
      firstName,
      lastName,
      displayName,
      primaryEmail,
      passwordHash: hashMailPassword(payload.password),
      stalwartAccountId: stalwartAccountId || null,
      aliases: [],
      orgUnitPath,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      recoverableUntil: null,
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_USER_CREATED',
      target: primaryEmail,
      metadata: { userId: docRef.id, orgUnitPath },
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    const domain = await assertActiveMailDomainBinding(orgId, orgData);

    const firstCheck = validateAndSanitizeInput(payload.firstName || '', 'First name', {
      required: true,
      maxLength: 64,
    });
    if (!firstCheck.isValid) {
      return { success: false, error: firstCheck.error };
    }

    const lastCheck = validateAndSanitizeInput(payload.lastName || '', 'Last name', {
      required: false,
      maxLength: 64,
    });
    if (!lastCheck.isValid) {
      return { success: false, error: lastCheck.error };
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
    const firstName = firstCheck.sanitized;
    const lastName = lastCheck.sanitized;
    const displayName = `${firstName} ${lastName}`.trim();
    const orgUnitPath = payload.orgUnitPath
      ? stripScripts(payload.orgUnitPath, { maxLength: 64 }) || '/'
      : userData.orgUnitPath || '/';
    const updatedAt = new Date().toISOString();

    await userRef.update({
      firstName,
      lastName,
      displayName,
      orgUnitPath,
      updatedAt,
    });

    await syncStalwartUserPrincipal({
      primaryEmail: userData.primaryEmail,
      displayName,
      orgUnitPath,
      aliases: Array.isArray(userData.aliases) ? userData.aliases : [],
      domain,
      isCatchAllTarget: orgData.mailCatchAllUserId === userId,
      expectedPrincipalId: userData.stalwartAccountId || null,
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_USER_UPDATED',
      target: userData.primaryEmail,
      metadata: { userId, displayName, orgUnitPath },
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
  newPassword: string,
  stepUpToken?: string
) {
  if (!orgId || !userId) return { success: false, error: 'Missing parameters.' };
  try {
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    assertStepUpMfa(uid, stepUpToken);
    const domain = await assertActiveMailDomainBinding(orgId, orgData);
    const passwordError = validateMailPassword(newPassword);
    if (passwordError) {
      return { success: false, error: passwordError };
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

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    await syncStalwartUserPrincipal({
      primaryEmail: userData.primaryEmail,
      displayName: userData.displayName || userData.firstName,
      orgUnitPath: userData.orgUnitPath || '/',
      aliases: Array.isArray(userData.aliases) ? userData.aliases : [],
      domain,
      isCatchAllTarget: orgData.mailCatchAllUserId === userId,
      plainPassword: newPassword,
      expectedPrincipalId: userData.stalwartAccountId || null,
    });

    await userRef.update({
      passwordHash: hashMailPassword(newPassword),
      updatedAt: nowIso,
      passwordUpdatedAt: nowIso,
      passwordUpdatedBy: email,
      sessionRevokedAt: nowMs,
      sessionsRevokedAt: nowMs,
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_USER_PASSWORD_RESET',
      target: userData.primaryEmail,
      metadata: { userId },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to reset password.' };
  }
}

export async function resetMailUserMfa(
  idToken: string,
  orgId: string,
  userId: string,
  stepUpToken?: string
) {
  if (!orgId || !userId) return { success: false, error: 'Missing parameters.' };
  try {
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    assertStepUpMfa(uid, stepUpToken);
    await assertActiveMailDomainBinding(orgId, orgData);

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const userRef = orgRef.collection('mailUsers').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return { success: false, error: 'Email account not found.' };
    }

    const userData = userDoc.data()!;
    const targetEmail = (userData.primaryEmail || '').toLowerCase().trim();
    if (!targetEmail) {
      return { success: false, error: 'Mailbox email address is missing.' };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    await orgRef
      .collection('mailUserMfa')
      .doc(encodeURIComponent(targetEmail))
      .set({
        email: targetEmail,
        totpEnabled: false,
        totpSecret: null,
        totpPendingSecret: null,
        passkeys: [],
        pendingChallenge: null,
        secondaryEmail: null,
        secondaryEmailVerified: false,
        secondaryOtpHash: null,
        secondaryOtpExpiresAt: null,
        backupCodes: [],
        updatedAt: nowIso,
        adminResetAt: nowIso,
        adminResetBy: email,
      });

    await userRef.update({
      sessionRevokedAt: nowMs,
      sessionsRevokedAt: nowMs,
      updatedAt: nowIso,
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_USER_MFA_RESET',
      target: targetEmail,
      metadata: { userId },
    });

    return { success: true, email: targetEmail };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to remove MFA settings.' };
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    const domain = await assertActiveMailDomainBinding(orgId, orgData);

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
      if (currentAliases.length >= MAX_ALIASES_PER_USER) {
        return {
          success: false,
          error: `Maximum of ${MAX_ALIASES_PER_USER} aliases per email account reached.`,
        };
      }
      const prefixCheck = validateEmailLocalPart(payload.aliasPrefix || '', 'Alias username');
      if (!prefixCheck.valid) {
        return { success: false, error: prefixCheck.error };
      }
      const newAlias = `${prefixCheck.prefix}@${domain}`;
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
      const prefixCheck = validateEmailLocalPart(
        payload.updatedAliasPrefix || '',
        'Alias username'
      );
      if (!prefixCheck.valid) {
        return { success: false, error: prefixCheck.error };
      }
      const updatedAlias = `${prefixCheck.prefix}@${domain}`;
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

    // Synchronize canonical emails array (primaryEmail at index 0 + aliases + catch-all) to Stalwart
    await syncStalwartUserPrincipal({
      primaryEmail: userData.primaryEmail,
      displayName: userData.displayName || userData.firstName,
      orgUnitPath: userData.orgUnitPath || '/',
      aliases: currentAliases,
      domain,
      isCatchAllTarget: orgData.mailCatchAllUserId === userId,
      expectedPrincipalId: userData.stalwartAccountId || null,
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: `MAIL_ALIAS_${action.toUpperCase()}`,
      target: userData.primaryEmail,
      metadata: { userId, aliases: currentAliases },
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    const domain = await assertActiveMailDomainBinding(orgId, orgData);
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
    const nextStatus = suspend ? 'suspended' : 'active';
    const nowMs = Date.now();
    const updatedAt = new Date(nowMs).toISOString();

    const wasCatchAll = orgData.mailCatchAllUserId === userId;
    await syncStalwartUserPrincipal({
      primaryEmail: userData.primaryEmail,
      displayName: userData.displayName || userData.firstName,
      orgUnitPath: userData.orgUnitPath || '/',
      aliases: Array.isArray(userData.aliases) ? userData.aliases : [],
      domain,
      isCatchAllTarget: !suspend && wasCatchAll,
      disabled: suspend,
      expectedPrincipalId: userData.stalwartAccountId || null,
    });

    await userRef.update({
      status: nextStatus,
      updatedAt,
      ...(suspend ? { sessionRevokedAt: nowMs } : {}),
    });

    // If this account was the catch-all fallback and is now suspended, clear catch-all
    if (suspend && wasCatchAll) {
      await adminDb.collection('organizations').doc(orgId).update({
        mailCatchAllUserId: null,
        mailCatchAllEmail: null,
      });
    }

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: suspend ? 'MAIL_USER_SUSPENDED' : 'MAIL_USER_REACTIVATED',
      target: userData.primaryEmail,
      metadata: { userId },
    });

    return {
      success: true,
      data: { status: nextStatus, updatedAt },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to update account suspension status.',
    };
  }
}

export async function deleteMailUserAccount(idToken: string, orgId: string, userId: string) {
  if (!orgId || !userId) return { success: false, error: 'Missing parameters.' };
  try {
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    const domain = await assertActiveMailDomainBinding(orgId, orgData);
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
    const nowMs = Date.now();
    const deletedAt = new Date(nowMs).toISOString();
    const recoverableUntil = new Date(nowMs + FOURTEEN_DAYS_MS).toISOString();

    await syncStalwartUserPrincipal({
      primaryEmail: userData.primaryEmail,
      displayName: userData.displayName || userData.firstName,
      orgUnitPath: userData.orgUnitPath || '/',
      aliases: Array.isArray(userData.aliases) ? userData.aliases : [],
      domain,
      isCatchAllTarget: false,
      disabled: true,
      expectedPrincipalId: userData.stalwartAccountId || null,
    });

    await userRef.update({
      status: 'deleted',
      deletedAt,
      recoverableUntil,
      updatedAt: deletedAt,
      sessionRevokedAt: nowMs,
      sessionsRevokedAt: nowMs,
    });

    if (orgData.mailCatchAllUserId === userId) {
      await adminDb.collection('organizations').doc(orgId).update({
        mailCatchAllUserId: null,
        mailCatchAllEmail: null,
      });
    }

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_USER_DELETED_14D_RECOVERY',
      target: userData.primaryEmail,
      metadata: { userId, recoverableUntil },
    });

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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    const domain = await assertActiveMailDomainBinding(orgId, orgData);
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
      // Do not delete directly here; permanent deletion is handled by the retention
      // worker after verifying no active legal hold protects this mailbox.
      return {
        success: false,
        error:
          'The 14-day recovery window for this account has expired. Permanent deletion is handled automatically after legal-hold verification.',
      };
    }

    const stalwartAccountId = await syncStalwartUserPrincipal({
      primaryEmail: data.primaryEmail,
      displayName: data.displayName || data.firstName,
      orgUnitPath: data.orgUnitPath || '/',
      aliases: Array.isArray(data.aliases) ? data.aliases : [],
      domain,
      isCatchAllTarget: false,
      disabled: false,
      expectedPrincipalId: data.stalwartAccountId || null,
    });

    const updatedAt = new Date().toISOString();
    await userRef.update({
      status: 'active',
      deletedAt: null,
      recoverableUntil: null,
      updatedAt,
      ...(stalwartAccountId && !data.stalwartAccountId ? { stalwartAccountId } : {}),
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_USER_RECOVERED',
      target: data.primaryEmail,
      metadata: { userId },
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
    await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Read', 'Email: Add', 'Email: Admin']);
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
        createdAt: toIsoSafe(d.createdAt),
        updatedAt: toIsoSafe(d.updatedAt),
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    const domain = await assertActiveMailDomainBinding(orgId, orgData);

    const nameCheck = validateAndSanitizeInput(payload.name || '', 'Group name', {
      required: true,
      maxLength: 80,
    });
    if (!nameCheck.isValid) {
      return { success: false, error: nameCheck.error };
    }

    const prefixCheck = validateEmailLocalPart(payload.emailPrefix, 'Group address prefix');
    if (!prefixCheck.valid) {
      return { success: false, error: prefixCheck.error };
    }

    const groupEmail = `${prefixCheck.prefix}@${domain}`;
    const conflict = await isEmailAddressTakenInOrg(orgId, groupEmail);
    if (conflict) {
      return { success: false, error: conflict };
    }

    const name = nameCheck.sanitized;
    const orgUnitPath = stripScripts(payload.orgUnitPath || '/', { maxLength: 64 }) || '/';
    const memberEmails = Array.from(
      new Set(
        (payload.memberEmails || [])
          .map((m) => m.toLowerCase().trim())
          .filter((m) => isValidEmailAddress(m))
      )
    ).slice(0, MAX_MEMBERS_PER_GROUP);

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

    await syncStalwartGroupPrincipal({
      groupEmail,
      name,
      memberEmails,
      isCreate: true,
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_GROUP_CREATED',
      target: groupEmail,
      metadata: { groupId: docRef.id, memberCount: memberEmails.length },
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    await assertActiveMailDomainBinding(orgId, orgData);
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
    let name = current.name;
    if (payload.name !== undefined) {
      const nameCheck = validateAndSanitizeInput(payload.name, 'Group name', {
        required: true,
        maxLength: 80,
      });
      if (!nameCheck.isValid) {
        return { success: false, error: nameCheck.error };
      }
      name = nameCheck.sanitized;
    }

    const orgUnitPath =
      payload.orgUnitPath !== undefined
        ? stripScripts(payload.orgUnitPath, { maxLength: 64 }) || '/'
        : current.orgUnitPath || '/';

    let memberEmails: string[];
    if (payload.memberEmails !== undefined) {
      if (payload.memberEmails.length > MAX_MEMBERS_PER_GROUP) {
        return {
          success: false,
          error: `A group cannot exceed ${MAX_MEMBERS_PER_GROUP} member addresses.`,
        };
      }
      memberEmails = Array.from(
        new Set(
          payload.memberEmails
            .map((m) => m.toLowerCase().trim())
            .filter((m) => isValidEmailAddress(m))
        )
      );
    } else {
      memberEmails = Array.isArray(current.memberEmails) ? current.memberEmails : [];
    }

    const updatedAt = new Date().toISOString();
    await groupRef.update({
      name,
      orgUnitPath,
      memberEmails,
      updatedAt,
    });

    await syncStalwartGroupPrincipal({
      groupEmail: current.groupEmail,
      name,
      memberEmails,
      isCreate: false,
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_GROUP_UPDATED',
      target: current.groupEmail,
      metadata: { groupId, memberCount: memberEmails.length },
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    await assertActiveMailDomainBinding(orgId, orgData);
    const groupRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailGroups')
      .doc(groupId);

    const groupDoc = await groupRef.get();
    const groupEmail = groupDoc.exists ? groupDoc.data()?.groupEmail : null;

    await groupRef.delete();

    if (groupEmail) {
      const cleanEmail = groupEmail.toLowerCase().trim();
      try {
        const mlResponses = await callStalwartJmap([
          ['x:MailingList/get', { accountId: 'b', ids: null }, 'mlList'],
        ]);
        const mlList: any[] = mlResponses.find((r) => r[0] === 'x:MailingList/get')?.[1]?.list || [];
        const existingMl = mlList.find(
          (m) => (m.emailAddress || '').toLowerCase() === cleanEmail
        );
        if (existingMl?.id) {
          await callStalwartJmap([
            ['x:MailingList/set', { accountId: 'b', destroy: [existingMl.id] }, 'delMl'],
          ]);
        }
      } catch (stalwartErr) {
        console.warn('[Stalwart JMAP] Delete mailing list warning:', stalwartErr);
      }
      await dispatchStalwartApi(
        'DELETE',
        `/api/principal/${encodeURIComponent(cleanEmail)}`
      );
    }

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_GROUP_DELETED',
      target: groupEmail || groupId,
      metadata: { groupId },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete group.' };
  }
}

export interface BulkImportUserRow {
  firstName: string;
  lastName: string;
  emailPrefix: string;
  password: string;
  orgUnitPath?: string;
}

export async function bulkCreateMailUsers(
  idToken: string,
  orgId: string,
  rows: BulkImportUserRow[]
) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, error: 'No user rows provided for import.' };
  }
  if (rows.length > 200) {
    return { success: false, error: 'Bulk import is limited to 200 accounts per batch.' };
  }

  try {
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Add', 'Email: Admin']);
    const domain = await assertActiveMailDomainBinding(orgId, orgData);

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const colRef = orgRef.collection('mailUsers');
    const [existingUsersSnap, existingGroupsSnap, existingSharedSnap] = await Promise.all([
      colRef.get(),
      orgRef.collection('mailGroups').get(),
      orgRef.collection('mailSharedMailboxes').get(),
    ]);

    const takenEmails = new Set<string>();
    const nowMs = Date.now();
    for (const uDoc of existingUsersSnap.docs) {
      const d = uDoc.data();
      if (d.status === 'deleted' && d.recoverableUntil) {
        if (new Date(d.recoverableUntil).getTime() <= nowMs) {
          continue;
        }
      }
      if (d.primaryEmail) {
        takenEmails.add(String(d.primaryEmail).toLowerCase().trim());
      }
      if (Array.isArray(d.aliases)) {
        for (const a of d.aliases) {
          if (a) takenEmails.add(String(a).toLowerCase().trim());
        }
      }
    }
    for (const gDoc of existingGroupsSnap.docs) {
      const gEmail = gDoc.data().groupEmail;
      if (gEmail) {
        takenEmails.add(String(gEmail).toLowerCase().trim());
      }
    }
    for (const sDoc of existingSharedSnap.docs) {
      const sEmail = sDoc.data().email;
      if (sEmail) {
        takenEmails.add(String(sEmail).toLowerCase().trim());
      }
    }

    let currentCount = existingUsersSnap.size;

    const createdUsers: MailUserRecord[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowLabel = `Row ${i + 1}`;
      if (currentCount >= MAX_MAILBOXES_PER_ORG) {
        errors.push(`${rowLabel}: Organization mailbox limit (${MAX_MAILBOXES_PER_ORG}) reached.`);
        break;
      }

      const firstCheck = validateAndSanitizeInput(row.firstName || '', 'First name', {
        required: true,
        maxLength: 64,
      });
      if (!firstCheck.isValid) {
        errors.push(`${rowLabel}: ${firstCheck.error}`);
        continue;
      }

      const lastCheck = validateAndSanitizeInput(row.lastName || '', 'Last name', {
        required: false,
        maxLength: 64,
      });
      if (!lastCheck.isValid) {
        errors.push(`${rowLabel}: ${lastCheck.error}`);
        continue;
      }

      const prefixCheck = validateEmailLocalPart(row.emailPrefix || '', 'Email username');
      if (!prefixCheck.valid) {
        errors.push(`${rowLabel}: ${prefixCheck.error}`);
        continue;
      }

      const passwordError = validateMailPassword(row.password || '');
      if (passwordError) {
        errors.push(`${rowLabel} (${prefixCheck.prefix}): ${passwordError}`);
        continue;
      }

      const primaryEmail = `${prefixCheck.prefix}@${domain}`;
      if (takenEmails.has(primaryEmail)) {
        errors.push(`${rowLabel} (${primaryEmail}): Address "${primaryEmail}" is already assigned in this organization.`);
        continue;
      }

      const firstName = firstCheck.sanitized;
      const lastName = lastCheck.sanitized;
      const displayName = `${firstName} ${lastName}`.trim();
      const orgUnitPath = stripScripts(row.orgUnitPath || '/', { maxLength: 64 }) || '/';
      const now = new Date().toISOString();
      const passwordHash = await hashMailPasswordAsync(row.password);

      let stalwartAccountId: string | null = null;
      try {
        stalwartAccountId = await syncStalwartUserPrincipal({
          primaryEmail,
          displayName,
          orgUnitPath,
          aliases: [],
          domain,
          isCatchAllTarget: false,
          plainPassword: row.password,
          isCreate: true,
        });
      } catch (providerErr: any) {
        errors.push(`${rowLabel} (${primaryEmail}): ${providerErr?.message || 'Mail server rejected mailbox creation.'}`);
        continue;
      }

      const docRef = await colRef.add({
        firstName,
        lastName,
        displayName,
        primaryEmail,
        passwordHash,
        stalwartAccountId: stalwartAccountId || null,
        aliases: [],
        orgUnitPath,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        recoverableUntil: null,
      });

      takenEmails.add(primaryEmail);

      createdUsers.push({
        id: docRef.id,
        firstName,
        lastName,
        displayName,
        primaryEmail,
        aliases: [],
        orgUnitPath,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        recoverableUntil: null,
      });
      currentCount++;
    }

    if (createdUsers.length > 0) {
      await logMailAuditEvent({
        orgId,
        actorUid: uid,
        actorEmail: email,
        action: 'MAIL_USERS_BULK_IMPORTED',
        target: domain,
        metadata: { createdCount: createdUsers.length, skippedCount: errors.length },
      });
    }

    return {
      success: true,
      data: {
        createdUsers,
        createdCount: createdUsers.length,
        skippedCount: errors.length,
        errors,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to import email accounts.' };
  }
}

// purgeExpiredMailData moved to @/lib/mail-internal
