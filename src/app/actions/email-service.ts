'use server';

import crypto from 'crypto';
import dns from 'dns';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/firebase/admin';
import { verifyUserOrgAccess } from './auth-helper';
import {
  listDNSRecords,
  createDNSRecord,
  deleteDNSRecord,
} from './dns-service';
import { cfFetch } from './dns-client';
import { validateAndSanitizeInput, stripScripts } from '@/lib/security/sanitize';
import { hashMailPassword, hashMailPasswordAsync } from '@/lib/security/mail-crypto';
import {
  logMailAuditEvent,
  getStalwartConfig,
  callStalwartJmap,
  findStalwartAccountByEmail,
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

async function syncCustomDkimTargetCnames(tokens: string[]): Promise<void> {
  if (!MAIL_DKIM_TARGET_DOMAIN || MAIL_DKIM_TARGET_DOMAIN === 'dkim.amazonses.com') {
    return;
  }
  const cfToken = (process.env.CLOUDFLARE_DNS_TOKEN || '').trim();
  if (!cfToken || tokens.length === 0) return;

  const zoneId = (process.env.REVLET_CLOUDFLARE_ZONE_ID || 'b01f5fc25d042b813d59034710fe4476').trim();
  const headers = {
    Authorization: `Bearer ${cfToken}`,
    'Content-Type': 'application/json',
  };

  for (const token of tokens) {
    const cleanToken = String(token || '').trim().toLowerCase();
    if (!cleanToken) continue;
    const fqdn = `${cleanToken}.${MAIL_DKIM_TARGET_DOMAIN}`;
    const target = `${cleanToken}.dkim.amazonses.com`;
    try {
      const checkRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(fqdn)}`,
        { headers, cache: 'no-store' }
      );
      const checkData = await checkRes.json().catch(() => ({}));
      const existing = Array.isArray(checkData?.result) ? checkData.result[0] : null;
      if (existing && String(existing.content || '').toLowerCase() === target) {
        continue;
      }
      if (existing?.id) {
        await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existing.id}`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({ type: 'CNAME', name: fqdn, content: target, ttl: 300, proxied: false }),
          }
        );
      } else {
        await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'CNAME', name: fqdn, content: target, ttl: 300, proxied: false }),
          }
        );
      }
    } catch {
      // Non-blocking DNS sync
    }
  }
}

interface OrgDkimConfig {
  mode: 'byodkim' | 'easydkim';
  selector: string;
  publicKey: string;
  tokens: string[];
}

async function provisionAwsSesByoDkim(
  domain: string,
  selector: string,
  privateKeyB64: string
): Promise<boolean> {
  const cleanDomain = domain.toLowerCase().trim();
  if (!cleanDomain || cleanDomain.includes('@') || !privateKeyB64) return false;

  const encoded = encodeURIComponent(cleanDomain);
  const getRes = await callAwsSesV2Api('GET', `/v2/email/identities/${encoded}`);

  if (getRes.ok) {
    if (getRes.data?.DkimAttributes?.SigningAttributesOrigin === 'EXTERNAL') {
      return true;
    }
    const putRes = await callAwsSesV2Api('PUT', `/v2/email/identities/${encoded}/dkim/signing`, {
      SigningAttributesOrigin: 'EXTERNAL',
      SigningAttributes: {
        DomainSigningSelector: selector,
        DomainSigningPrivateKey: privateKeyB64,
      },
    });
    return putRes.ok;
  }

  const createRes = await callAwsSesV2Api('POST', '/v2/email/identities', {
    EmailIdentity: cleanDomain,
    DkimSigningAttributes: {
      DomainSigningSelector: selector,
      DomainSigningPrivateKey: privateKeyB64,
    },
  });
  return createRes.ok;
}

async function provisionAwsSesDomainTokens(domain: string): Promise<string[] | null> {
  const cleanDomain = domain.toLowerCase().trim();
  // Guard: strictly enforce DOMAIN identities only, never individual EMAIL_ADDRESS identities
  if (!cleanDomain || cleanDomain.includes('@')) return null;

  const encoded = encodeURIComponent(cleanDomain);
  // 1. Check if domain identity already exists in AWS SES v2
  const getRes = await callAwsSesV2Api('GET', `/v2/email/identities/${encoded}`);
  if (getRes.ok && Array.isArray(getRes.data?.DkimAttributes?.Tokens)) {
    const tokens = getRes.data.DkimAttributes.Tokens.filter(Boolean);
    if (tokens.length === 3) {
      await syncCustomDkimTargetCnames(tokens);
      return tokens;
    }
  }

  // 2. Otherwise create the domain identity in AWS SES v2 automatically with 2048-bit RSA DKIM
  const createRes = await callAwsSesV2Api('POST', '/v2/email/identities', {
    EmailIdentity: cleanDomain,
    DkimSigningAttributes: {
      NextSigningKeyLength: 'RSA_2048_BIT',
    },
  });
  if (createRes.ok && Array.isArray(createRes.data?.DkimAttributes?.Tokens)) {
    const tokens = createRes.data.DkimAttributes.Tokens.filter(Boolean);
    if (tokens.length === 3) {
      await syncCustomDkimTargetCnames(tokens);
      return tokens;
    }
  }

  return null;
}

// ============================================================================
// DNS RECORDS & LIVE PUBLIC DNS VERIFICATION
// ============================================================================

function generateDeterministicDkimTokens(orgId: string, domain: string): string[] {
  return [1, 2, 3].map((index) =>
    crypto
      .createHash('sha256')
      .update(`revlet-mail-dkim-${orgId}-${domain}-${index}`)
      .digest('hex')
      .slice(0, 24)
  );
}

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
  const normalizedDomain = domain.toLowerCase().trim();
  if (!normalizedDomain) return [];

  const cacheKey =
    dkimConfig.mode === 'byodkim'
      ? `${normalizedDomain}:byodkim:${dkimConfig.selector}`
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
      content: MAIL_MX_HOST,
      priority: 10,
      ttl: 'Auto',
      verified: isPresent('MX', normalizedDomain, MAIL_MX_HOST),
    },
    {
      id: 'txt-spf',
      purpose: 'Sender Policy Authorization (SPF)',
      type: 'TXT',
      name: normalizedDomain,
      content: `v=spf1 mx include:${MAIL_SPF_INCLUDE} include:amazonses.com ~all`,
      ttl: 'Auto',
      verified:
        isPresent('TXT', normalizedDomain, `include:${MAIL_SPF_INCLUDE}`) ||
        isPresent('TXT', normalizedDomain, 'include:amazonses.com') ||
        isPresent('TXT', normalizedDomain, 'v=spf1 mx'),
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

  if (dkimConfig.mode === 'byodkim') {
    const recordName = `${dkimConfig.selector}._domainkey.${normalizedDomain}`;
    const recordContent = `v=DKIM1; k=rsa; p=${dkimConfig.publicKey}`;
    records.push({
      id: 'txt-dkim-1',
      purpose: 'Outbound Mail Signing (DKIM)',
      type: 'TXT',
      name: recordName,
      content: recordContent,
      ttl: 'Auto',
      verified: isPresent('TXT', recordName, `p=${dkimConfig.publicKey}`),
    });
  } else {
    dkimConfig.tokens.slice(0, 3).forEach((token, idx) => {
      const recordName = `${token}._domainkey.${normalizedDomain}`;
      const recordTarget = `${token}.${MAIL_DKIM_TARGET_DOMAIN}`;
      records.push({
        id: `cname-dkim-${idx + 1}`,
        purpose: `Domain Signing Key #${idx + 1} (DKIM)`,
        type: 'CNAME',
        name: recordName,
        content: recordTarget,
        ttl: 'Auto',
        verified:
          isPresent('CNAME', recordName, recordTarget) ||
          isPresent('CNAME', recordName, `${token}.dkim.amazonses.com`),
      });
    });
  }

  return records;
}

async function ensureOrgDkimConfig(
  orgId: string,
  orgData: FirebaseFirestore.DocumentData
): Promise<OrgDkimConfig> {
  const domain = (orgData.domain || '').toLowerCase().trim();

  // Preserve legacy active Easy DKIM domains that already verified 3 CNAMEs
  if (
    orgData.mailServiceActive === true &&
    orgData.mailDkimMode !== 'byodkim' &&
    !orgData.mailDkimPublicKey &&
    Array.isArray(orgData.mailDkimTokens) &&
    orgData.mailDkimTokens.length === 3
  ) {
    const sesTokens = domain ? await provisionAwsSesDomainTokens(domain) : null;
    return {
      mode: 'easydkim',
      selector: 'revlet',
      publicKey: '',
      tokens: sesTokens && sesTokens.length === 3 ? sesTokens : orgData.mailDkimTokens,
    };
  }

  const orgRef = adminDb.collection('organizations').doc(orgId);
  const secretRef = orgRef.collection('privateSecrets').doc('dkim');
  let selector = (typeof orgData.mailDkimSelector === 'string' && orgData.mailDkimSelector.trim()) || 'revlet';
  let publicKey = typeof orgData.mailDkimPublicKey === 'string' ? orgData.mailDkimPublicKey.trim() : '';
  let privateKey = '';

  const secretSnap = await secretRef.get().catch(() => null);
  if (secretSnap?.exists) {
    const sData = secretSnap.data() || {};
    if (typeof sData.privateKey === 'string' && sData.privateKey.trim()) {
      privateKey = sData.privateKey.trim();
    }
    if (!publicKey && typeof sData.publicKey === 'string' && sData.publicKey.trim()) {
      publicKey = sData.publicKey.trim();
    }
  }

  if (!publicKey || !privateKey) {
    const pair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    publicKey = pair.publicKey.toString('base64');
    privateKey = pair.privateKey.toString('base64');
    selector = 'revlet';

    await Promise.all([
      secretRef.set({
        selector,
        publicKey,
        privateKey,
        updatedAt: new Date().toISOString(),
      }),
      orgRef.update({
        mailDkimMode: 'byodkim',
        mailDkimSelector: selector,
        mailDkimPublicKey: publicKey,
        updatedAt: new Date().toISOString(),
      }),
    ]).catch(() => {});
  } else if (orgData.mailDkimMode !== 'byodkim' || orgData.mailDkimPublicKey !== publicKey) {
    await orgRef.update({
      mailDkimMode: 'byodkim',
      mailDkimSelector: selector,
      mailDkimPublicKey: publicKey,
    }).catch(() => {});
  }

  if (domain && (!orgData.mailSesIdentityProvisioned || orgData.mailDkimMode !== 'byodkim')) {
    const provisioned = await provisionAwsSesByoDkim(domain, selector, privateKey);
    if (provisioned) {
      await orgRef.update({
        mailSesIdentityProvisioned: true,
        mailDkimMode: 'byodkim',
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  return {
    mode: 'byodkim',
    selector,
    publicKey,
    tokens: [],
  };
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
    const expectedMxHost = MAIL_MX_HOST.toLowerCase().replace(/\.$/, '').trim();

    // Disable conflicting Cloudflare Email Routing if present on zone so it does not intercept MX records
    try {
      const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['Email: Admin']);
      await cfFetch(`/zones/${zoneId}/email/routing/disable`, { method: 'POST' }, verified.cfToken);
    } catch {
      // Non-fatal if Email Routing is not configured on zone
    }

    // Remove conflicting root MX records (any MX that does not point to mx.revlet.me) and conflicting SPF records
    const conflictingRootRecords = currentRecords.filter((r: any) => {
      const rType = (r.type || '').toUpperCase();
      const rName = (r.name || '').toLowerCase().replace(/\.$/, '').trim();
      const isRoot = rName === normalizedDomain || rName === '@' || rName === '';

      if (rType === 'MX') {
        const rContent = (r.content || '').toLowerCase().replace(/\.$/, '').trim();
        // If it's on root and not pointing to mx.revlet.me, it's a conflict
        if (isRoot && rContent !== expectedMxHost) {
          return true;
        }
      }

      if (rType === 'TXT' && isRoot) {
        const rContent = (r.content || '').toLowerCase();
        if (rContent.includes('v=spf1') && !rContent.includes(MAIL_SPF_INCLUDE.toLowerCase())) {
          return true;
        }
      }

      return false;
    });

    for (const conflict of conflictingRootRecords) {
      try {
        console.log(`[Email Service Activation] Removing conflicting record ${conflict.type} ${conflict.name} -> ${conflict.content}`);
        await deleteDNSRecord(idToken, orgId, zoneId, conflict.id);
      } catch (delErr) {
        console.warn(`[Email Service Activation] Warning deleting conflict ${conflict.id}:`, delErr);
      }
    }

    const refreshedRes = await listDNSRecords(idToken, orgId, zoneId);
    const liveAfterDelete: any[] = refreshedRes.success ? refreshedRes.data || [] : currentRecords;

    const requiredRecords = buildRequiredDnsRecords(normalizedDomain, dkimConfig, liveAfterDelete);
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
    await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
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
    const { orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Read', 'Email: Add', 'Email: Admin']);
    const domain = (orgData.domain || '').toLowerCase().trim();
    const dkimConfig = await ensureOrgDkimConfig(orgId, orgData);

    let liveRecords: any[] = [];
    const dnsServiceActive = Boolean(orgData.cloudflareZoneId);

    if (dnsServiceActive && orgData.cloudflareZoneId) {
      const dnsRes = await listDNSRecords(idToken, orgId, orgData.cloudflareZoneId);
      if (dnsRes.success && Array.isArray(dnsRes.data)) {
        liveRecords = dnsRes.data;
      }
    }

    // Fallback to live public DNS resolution if Cloudflare zone is not linked or returned empty
    if (liveRecords.length === 0 && domain) {
      liveRecords = await resolvePublicDnsRecords(domain, dkimConfig);
    }

    const requiredDnsRecords = buildRequiredDnsRecords(domain, dkimConfig, liveRecords);
    const rolling = await calculateRollingQuota(orgData);

    // Do NOT silently auto-activate organizations on read; require explicit activation via Email Service page.
    const effectiveMailServiceActive = Boolean(orgData.mailServiceActive);

    // Self-healing writeback if quota values rolled over or self-healed
    if (
      rolling.monthlySentCount !== orgData.mailMonthlySent ||
      rolling.dailySentCount !== orgData.mailDailySent
    ) {
      adminDb
        .collection('organizations')
        .doc(orgId)
        .update({
          mailDailySent: rolling.dailySentCount,
          mailMonthlySent: rolling.monthlySentCount,
          mailMonthlyBucket: new Date().toISOString().slice(0, 7),
          updatedAt: new Date().toISOString(),
        })
        .catch(() => {});
    }

    return {
      success: true,
      data: {
        mailServiceActive: effectiveMailServiceActive,
        dnsServiceActive,
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
    const domain = (orgData.domain || '').toLowerCase().trim();
    if (!domain) {
      return { success: false, error: 'Organization does not have a valid domain configured.' };
    }

    const dkimConfig = await ensureOrgDkimConfig(orgId, orgData);
    let dnsProvisionedAutomatically = false;
    let dnsAddedCount = 0;
    let dnsWarning: string | undefined;

    if (orgData.cloudflareZoneId) {
      const dnsResult = await provisionRequiredDnsRecordsOnZone(
        idToken,
        orgId,
        orgData.cloudflareZoneId,
        domain,
        dkimConfig
      );
      dnsProvisionedAutomatically = dnsResult.success;
      dnsAddedCount = dnsResult.addedCount;
      if (!dnsResult.success) {
        dnsWarning = dnsResult.error;
      }
    } else {
      const livePublic = await resolvePublicDnsRecords(domain, dkimConfig, true);
      const checkedRecords = buildRequiredDnsRecords(domain, dkimConfig, livePublic);
      const coreRequired = checkedRecords.filter((r) => r.id !== 'txt-spf' && r.id !== 'txt-dmarc');
      const allCoreVerified = coreRequired.length > 0 && coreRequired.every((r) => r.verified);
      if (!allCoreVerified) {
        return {
          success: false,
          error:
            'Please publish and verify both required DNS records (Inbound MX and Outbound DKIM) before activating Email Service.',
        };
      }
    }

    // Ensure domain principal exists on Stalwart Mail Server (disable Stalwart Auto-DKIM when SES BYODKIM signs outbound)
    await syncStalwartDomainPrincipal(domain, {
      disableAutoDkim: dkimConfig.mode === 'byodkim',
    });

    await adminDb.collection('organizations').doc(orgId).update({
      mailServiceActive: true,
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
      metadata: { dnsProvisionedAutomatically, dnsAddedCount },
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
    const { uid, email, isOwner, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    if (!isOwner) {
      return {
        success: false,
        error: 'Unauthorized: Only the organization owner can deactivate Email Service.',
      };
    }

    const nowMs = Date.now();
    const deactivatedAt = new Date(nowMs).toISOString();
    const purgeScheduledAt = new Date(nowMs + FOURTEEN_DAYS_MS).toISOString();

    await adminDb.collection('organizations').doc(orgId).update({
      mailServiceActive: false,
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
    const dkimConfig = await ensureOrgDkimConfig(orgId, orgData);

    await syncStalwartDomainPrincipal(domain, {
      disableAutoDkim: dkimConfig.mode === 'byodkim',
    }).catch(() => {});

    if (!orgData.cloudflareZoneId) {
      // Perform live DNS verification against public resolvers
      const livePublic = await resolvePublicDnsRecords(domain, dkimConfig);
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
    const domain = (orgData.domain || '').toLowerCase().trim();
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

export async function isEmailAddressTakenInOrg(
  orgId: string,
  candidateEmail: string,
  excludeUserId?: string,
  excludeGroupId?: string,
  excludeSharedMailboxId?: string
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

  const sharedSnap = await adminDb
    .collection('organizations')
    .doc(orgId)
    .collection('mailSharedMailboxes')
    .get();

  for (const doc of sharedSnap.docs) {
    if (excludeSharedMailboxId && doc.id === excludeSharedMailboxId) continue;
    const d = doc.data();
    if ((d.email || '').toLowerCase() === normalized) {
      return `Address "${normalized}" is already used by a shared mailbox.`;
    }
  }

  return null;
}

export async function listMailUsers(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Read', 'Email: Add', 'Email: Admin']);
    const colRef = adminDb.collection('organizations').doc(orgId).collection('mailUsers');
    const snap = await colRef.get();

    const nowMs = Date.now();
    const expiredDocs: Array<{ ref: FirebaseFirestore.DocumentReference; email: string }> = [];
    const users: MailUserRecord[] = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.status === 'deleted' && d.recoverableUntil) {
        const expiryMs = new Date(d.recoverableUntil).getTime();
        if (expiryMs <= nowMs) {
          expiredDocs.push({ ref: doc.ref, email: d.primaryEmail || '' });
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

    if (expiredDocs.length > 0) {
      const batch = adminDb.batch();
      expiredDocs.forEach((item) => batch.delete(item.ref));
      await batch.commit();

      // Purge expired principals from Stalwart Mail Server and notify organization owner
      const ownerEmail = await resolveOrganizationOwnerEmail(orgData);
      for (const item of expiredDocs) {
        if (item.email) {
          await dispatchStalwartApi(
            'DELETE',
            `/api/principal/${encodeURIComponent(item.email.toLowerCase().trim())}`
          );
          if (ownerEmail) {
            await sendRevletAlertEmail({
              to: ownerEmail,
              subject: `Email account permanently deleted: ${item.email}`,
              title: 'Email Account Permanently Deleted',
              subtitle: '14-Day Retention Policy Notice',
              summaryLines: [
                `The email account ${item.email} for ${orgData.name || orgData.domain} has reached the end of its 14-day recovery window and has been permanently deleted from Revlet mail servers.`,
                'All mailbox credentials and associated messages have been removed and cannot be recovered.',
              ],
              details: [
                { label: 'Organization', value: orgData.name || orgData.domain || orgId },
                { label: 'Deleted Account', value: item.email },
                { label: 'Completed At', value: new Date().toISOString() },
              ],
            }).catch(() => {});
          }
        }
      }
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
    const domain = (orgData.domain || '').toLowerCase().trim();
    if (!domain) {
      return { success: false, error: 'Organization domain is not configured.' };
    }

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

    const docRef = await colRef.add({
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

    // Provision principal in Stalwart Mail Server
    await syncStalwartUserPrincipal({
      primaryEmail,
      displayName,
      orgUnitPath,
      aliases: [],
      domain,
      isCatchAllTarget: false,
      plainPassword: payload.password,
      isCreate: true,
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
      domain: (orgData.domain || '').toLowerCase().trim(),
      isCatchAllTarget: orgData.mailCatchAllUserId === userId,
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
  newPassword: string
) {
  if (!orgId || !userId) return { success: false, error: 'Missing parameters.' };
  try {
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
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

    await userRef.update({
      passwordHash: hashMailPassword(newPassword),
      updatedAt: new Date().toISOString(),
    });

    await syncStalwartUserPrincipal({
      primaryEmail: userData.primaryEmail,
      displayName: userData.displayName || userData.firstName,
      orgUnitPath: userData.orgUnitPath || '/',
      aliases: Array.isArray(userData.aliases) ? userData.aliases : [],
      domain: (orgData.domain || '').toLowerCase().trim(),
      isCatchAllTarget: orgData.mailCatchAllUserId === userId,
      plainPassword: newPassword,
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
    const updatedAt = new Date().toISOString();

    await userRef.update({
      status: nextStatus,
      updatedAt,
    });

    // If this account was the catch-all fallback and is now suspended, clear catch-all
    const wasCatchAll = orgData.mailCatchAllUserId === userId;
    if (suspend && wasCatchAll) {
      await adminDb.collection('organizations').doc(orgId).update({
        mailCatchAllUserId: null,
        mailCatchAllEmail: null,
      });
    }

    await syncStalwartUserPrincipal({
      primaryEmail: userData.primaryEmail,
      displayName: userData.displayName || userData.firstName,
      orgUnitPath: userData.orgUnitPath || '/',
      aliases: Array.isArray(userData.aliases) ? userData.aliases : [],
      domain: (orgData.domain || '').toLowerCase().trim(),
      isCatchAllTarget: !suspend && wasCatchAll,
      disabled: suspend,
    });

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

    await syncStalwartUserPrincipal({
      primaryEmail: userData.primaryEmail,
      displayName: userData.displayName || userData.firstName,
      orgUnitPath: userData.orgUnitPath || '/',
      aliases: Array.isArray(userData.aliases) ? userData.aliases : [],
      domain: (orgData.domain || '').toLowerCase().trim(),
      isCatchAllTarget: false,
      disabled: true,
    });

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
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
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
      if (data.primaryEmail) {
        await dispatchStalwartApi(
          'DELETE',
          `/api/principal/${encodeURIComponent(data.primaryEmail.toLowerCase().trim())}`
        );
      }
      return { success: false, error: 'The 14-day recovery window for this account has expired.' };
    }

    const updatedAt = new Date().toISOString();
    await userRef.update({
      status: 'active',
      deletedAt: null,
      recoverableUntil: null,
      updatedAt,
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

    // Non-blocking self-healing reconciliation to ensure all groups in Firestore
    // are automatically synchronized in Stalwart Mail Server without manual recreation
    if (groups.length > 0) {
      Promise.allSettled(
        groups.map((g) =>
          syncStalwartGroupPrincipal({
            groupEmail: g.groupEmail,
            name: g.name,
            memberEmails: g.memberEmails,
          })
        )
      ).catch(() => {});
    }

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
    const domain = (orgData.domain || '').toLowerCase().trim();
    if (!domain) {
      return { success: false, error: 'Organization domain is not configured.' };
    }

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
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
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
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
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
    const domain = (orgData.domain || '').toLowerCase().trim();
    if (!domain) {
      return { success: false, error: 'Organization domain is not configured.' };
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const colRef = orgRef.collection('mailUsers');
    const [existingUsersSnap, existingGroupsSnap] = await Promise.all([
      colRef.get(),
      orgRef.collection('mailGroups').get(),
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

      const docRef = await colRef.add({
        firstName,
        lastName,
        displayName,
        primaryEmail,
        passwordHash,
        aliases: [],
        orgUnitPath,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        recoverableUntil: null,
      });

      takenEmails.add(primaryEmail);

      await syncStalwartUserPrincipal({
        primaryEmail,
        displayName,
        orgUnitPath,
        aliases: [],
        domain,
        isCatchAllTarget: false,
        plainPassword: row.password,
        isCreate: true,
      });

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
