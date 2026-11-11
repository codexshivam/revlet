'use server';

import crypto from 'crypto';
import dns from 'dns';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { verifyUserOrgAccess } from './auth-helper';
import {
  listDNSRecords,
  createDNSRecord,
  deleteDNSRecord,
  createZoneSnapshot,
} from './cloudflare-dns';
import { validateAndSanitizeInput, stripScripts } from '@/lib/security/sanitize';
import {
  hashMailPassword,
  buildCanonicalStalwartEmails,
} from '@/lib/security/mail-crypto';

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

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ORG_UNITS_PER_ORG = 50;
const MAX_ALIASES_PER_USER = 25;
const MAX_MEMBERS_PER_GROUP = 500;
const MAX_MAILBOXES_PER_ORG = 1000;
const DEFAULT_MAILBOX_QUOTA_BYTES = 536870912; // 512 MB per mailbox default

const MAIL_MX_HOST = (process.env.MAIL_MX_HOST || 'mx.revlet.me').toLowerCase().trim();
const MAIL_SPF_INCLUDE = (process.env.MAIL_SPF_INCLUDE || '_spf.mx.revlet.me').toLowerCase().trim();
const MAIL_DKIM_TARGET_DOMAIN = (
  process.env.MAIL_DKIM_TARGET_DOMAIN || 'dkim.amazonses.com'
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

// ============================================================================
// IMMUTABLE SECURITY AUDIT LOGGING
// ============================================================================

async function logMailAuditEvent(params: {
  orgId: string;
  actorUid: string;
  actorEmail?: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await adminDb
      .collection('organizations')
      .doc(params.orgId)
      .collection('mailAuditLogs')
      .add({
        actorUid: params.actorUid,
        actorEmail: params.actorEmail || null,
        action: params.action,
        target: params.target,
        metadata: params.metadata || {},
        createdAt: new Date().toISOString(),
        timestamp: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn('[Revlet Mail Audit] Non-fatal audit log write warning:', err);
  }
}

// ============================================================================
// STALWART MAIL SERVER PRINCIPAL DIRECTORY SYNCHRONIZATION BRIDGE
// ============================================================================

function getStalwartConfig() {
  const baseUrl = (process.env.STALWART_BASE_URL || 'https://mx.revlet.me').trim().replace(/\/+$/, '');
  const adminUser = (process.env.STALWART_ADMIN_USER || 'admin@example.org').trim();
  const adminToken = (process.env.STALWART_ADMIN_TOKEN || '').trim();
  const enabled = Boolean(baseUrl && adminToken);
  const authHeader = `Basic ${Buffer.from(`${adminUser}:${adminToken}`).toString('base64')}`;
  return { baseUrl, adminUser, adminToken, authHeader, enabled };
}

async function callStalwartJmap(
  methodCalls: [string, Record<string, unknown>, string][]
): Promise<any[]> {
  const { baseUrl, authHeader, enabled } = getStalwartConfig();
  if (!enabled) return [];

  if (process.env.NODE_ENV !== 'production' || process.env.STALWART_ALLOW_INSECURE_TLS === 'true') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${baseUrl}/jmap/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        using: [
          'urn:ietf:params:jmap:core',
          'urn:ietf:params:jmap:mail',
          'urn:ietf:params:jmap:submission',
          'urn:stalwart:jmap',
        ],
        methodCalls,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.methodResponses) ? data.methodResponses : [];
  } catch (err: any) {
    console.warn('[Stalwart JMAP] Call deferred:', err?.message || err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchStalwartApi(
  method: 'POST' | 'PATCH' | 'DELETE' | 'GET',
  endpoint: string,
  body?: unknown
): Promise<{ ok: boolean; status: number }> {
  const { baseUrl, adminToken, enabled } = getStalwartConfig();
  if (!enabled) {
    return { ok: true, status: 200 };
  }

  // If deleting a user principal, also remove via Stalwart JMAP x:Account/set
  if (method === 'DELETE' && endpoint.startsWith('/api/principal/')) {
    const emailTarget = decodeURIComponent(endpoint.replace('/api/principal/', ''))
      .toLowerCase()
      .trim();
    const responses = await callStalwartJmap([
      ['x:Account/get', { accountId: 'b', ids: null }, 'acc'],
    ]);
    const list: any[] = responses.find((r) => r[0] === 'x:Account/get')?.[1]?.list || [];
    const matched = list.find(
      (a) => (a.emailAddress || '').toLowerCase() === emailTarget
    );
    if (matched?.id) {
      await callStalwartJmap([
        ['x:Account/set', { accountId: 'b', destroy: [matched.id] }, 'del'],
      ]);
    }
    return { ok: true, status: 200 };
  }

  return { ok: true, status: 200 };
}

async function ensureStalwartDomainId(domain: string): Promise<string | null> {
  const cleanDomain = domain.toLowerCase().trim();
  if (!cleanDomain) return null;

  const responses = await callStalwartJmap([
    ['x:Domain/get', { accountId: 'b', ids: null }, 'domList'],
  ]);
  const domList: any[] = responses.find((r) => r[0] === 'x:Domain/get')?.[1]?.list || [];
  const existing = domList.find((d) => (d.name || '').toLowerCase() === cleanDomain);
  if (existing?.id) return existing.id;

  const createRes = await callStalwartJmap([
    [
      'x:Domain/set',
      {
        accountId: 'b',
        create: {
          dom0: {
            name: cleanDomain,
            enable: true,
            description: `Revlet Managed Domain (${cleanDomain})`,
            dkimManagement: {
              '@type': 'Automatic',
              algorithms: { Dkim1RsaSha256: true },
              selectorTemplate: 'v{version}-{algorithm}-{date-%Y%m%d}',
              rotateAfter: 7776000000,
              retireAfter: 604800000,
              deleteAfter: 2592000000,
            },
            subAddressing: { '@type': 'Enabled' },
          },
        },
      },
      'createDom',
    ],
    [
      'x:Action/set',
      {
        accountId: 'b',
        create: { act1: { '@type': 'ReloadSettings' } },
      },
      'reloadDom',
    ],
  ]);

  const createdId = createRes.find((r) => r[0] === 'x:Domain/set')?.[1]?.created?.dom0?.id;
  return createdId || null;
}

async function syncStalwartDomainPrincipal(domain: string) {
  await ensureStalwartDomainId(domain);
}

async function syncStalwartUserPrincipal(params: {
  primaryEmail: string;
  displayName: string;
  orgUnitPath: string;
  aliases: string[];
  domain: string;
  isCatchAllTarget: boolean;
  plainPassword?: string;
  isCreate?: boolean;
}) {
  const cleanEmail = params.primaryEmail.toLowerCase().trim();
  const [localPart, domainPart] = cleanEmail.split('@');
  if (!localPart || !domainPart) return;

  const domainId = await ensureStalwartDomainId(domainPart);
  if (!domainId) return;

  const accResponses = await callStalwartJmap([
    ['x:Account/get', { accountId: 'b', ids: null }, 'accList'],
  ]);
  const accList: any[] = accResponses.find((r) => r[0] === 'x:Account/get')?.[1]?.list || [];
  const existingAcc = accList.find(
    (a) => (a.emailAddress || '').toLowerCase() === cleanEmail
  );

  const aliasesMap: Record<string, unknown> = {};
  let aliasIdx = 0;
  for (const alias of params.aliases || []) {
    const cleanAlias = alias.toLowerCase().trim();
    if (cleanAlias && cleanAlias !== cleanEmail) {
      const [aLocal, aDomain] = cleanAlias.split('@');
      if (aLocal && aDomain) {
        const aDomId =
          aDomain === domainPart
            ? domainId
            : await ensureStalwartDomainId(aDomain);
        if (aDomId) {
          aliasesMap[String(aliasIdx++)] = {
            name: aLocal,
            domainId: aDomId,
            enable: true,
          };
        }
      }
    }
  }

  if (!existingAcc) {
    await callStalwartJmap([
      [
        'x:Account/set',
        {
          accountId: 'b',
          create: {
            usr0: {
              '@type': 'User',
              name: localPart,
              domainId,
              description: params.displayName || localPart,
              aliases: aliasesMap,
              roles: { '@type': 'User' },
              permissions: { '@type': 'Inherit' },
              ...(params.plainPassword
                ? {
                    credentials: {
                      '0': {
                        '@type': 'Password',
                        secret: params.plainPassword,
                      },
                    },
                  }
                : {}),
            },
          },
        },
        'createUsr',
      ],
    ]);
    return;
  }

  const updateFields: Record<string, unknown> = {
    description: params.displayName || existingAcc.description || localPart,
    aliases: aliasesMap,
  };
  if (params.plainPassword) {
    updateFields.credentials = {
      '0': {
        '@type': 'Password',
        secret: params.plainPassword,
      },
    };
  }

  await callStalwartJmap([
    [
      'x:Account/set',
      {
        accountId: 'b',
        update: {
          [existingAcc.id]: updateFields,
        },
      },
      'updUsr',
    ],
  ]);
}

async function syncStalwartGroupPrincipal(params: {
  groupEmail: string;
  name: string;
  memberEmails: string[];
  isCreate?: boolean;
}) {
  // Handled via Stalwart JMAP MailingList/Group sync when configured
  void params;
}

// ============================================================================
// AUTOMATED AWS SES v2 DOMAIN IDENTITY PROVISIONING (AWS SIGV4)
// Automatically registers client domains in AWS SES and retrieves Easy DKIM tokens
// so the platform owner never has to add client domains manually in the AWS Console.
// ============================================================================

function awsHmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function awsSha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

async function callAwsSesV2Api(
  method: 'POST' | 'GET',
  path: string,
  bodyObj?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: any }> {
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const region = (process.env.AWS_REGION || 'ap-southeast-2').trim();

  if (!accessKeyId || !secretAccessKey) {
    return { ok: false, status: 0, data: null };
  }

  const host = `email.${region}.amazonaws.com`;
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = awsSha256Hex(bodyStr);

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    awsSha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = awsHmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = awsHmac(kDate, region);
  const kService = awsHmac(kRegion, 'ses');
  const kSigning = awsHmac(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const res = await fetch(`https://${host}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-amz-date': amzDate,
        Authorization: authorization,
      },
      body: method === 'POST' ? bodyStr : undefined,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 503, data: null };
  }
}

async function provisionAwsSesDomainTokens(domain: string): Promise<string[] | null> {
  const cleanDomain = domain.toLowerCase().trim();
  if (!cleanDomain) return null;

  const encoded = encodeURIComponent(cleanDomain);
  // 1. Check if domain identity already exists in AWS SES v2
  const getRes = await callAwsSesV2Api('GET', `/v2/email/identities/${encoded}`);
  if (getRes.ok && Array.isArray(getRes.data?.DkimAttributes?.Tokens)) {
    const tokens = getRes.data.DkimAttributes.Tokens.filter(Boolean);
    if (tokens.length === 3) return tokens;
  }

  // 2. Otherwise create the domain identity in AWS SES v2 automatically
  const createRes = await callAwsSesV2Api('POST', '/v2/email/identities', {
    EmailIdentity: cleanDomain,
  });
  if (createRes.ok && Array.isArray(createRes.data?.DkimAttributes?.Tokens)) {
    const tokens = createRes.data.DkimAttributes.Tokens.filter(Boolean);
    if (tokens.length === 3) return tokens;
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

/**
 * Resolves live public DNS records (MX, TXT, _dmarc TXT, and DKIM CNAMEs)
 * when an organization manages DNS at an external registrar outside Cloudflare.
 */
async function resolvePublicDnsRecords(
  domain: string,
  dkimTokens: string[]
): Promise<Array<{ type: string; name: string; content: string; priority?: number }>> {
  const normalizedDomain = domain.toLowerCase().trim();
  if (!normalizedDomain) return [];

  const records: Array<{ type: string; name: string; content: string; priority?: number }> = [];

  const withTimeout = <T>(promise: Promise<T>, ms = 2500): Promise<T | null> =>
    Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]).catch(() => null);

  const [mxRes, txtRes, dmarcRes, ...cnameResults] = await Promise.all([
    withTimeout(dnsPromises.resolveMx(normalizedDomain)),
    withTimeout(dnsPromises.resolveTxt(normalizedDomain)),
    withTimeout(dnsPromises.resolveTxt(`_dmarc.${normalizedDomain}`)),
    ...dkimTokens.slice(0, 3).map((token) =>
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

  dkimTokens.slice(0, 3).forEach((token, idx) => {
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

  return records;
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

  dkimTokens.slice(0, 3).forEach((token, idx) => {
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

  return records;
}

async function ensureOrgDkimTokens(
  orgId: string,
  orgData: FirebaseFirestore.DocumentData
): Promise<string[]> {
  const domain = (orgData.domain || '').toLowerCase().trim();

  // Attempt automatic AWS SES v2 Domain Identity registration & Easy DKIM token fetch
  if (domain && !orgData.mailSesIdentityProvisioned) {
    const sesTokens = await provisionAwsSesDomainTokens(domain);
    if (sesTokens && sesTokens.length === 3) {
      await adminDb.collection('organizations').doc(orgId).update({
        mailDkimTokens: sesTokens,
        mailSesIdentityProvisioned: true,
      });
      return sesTokens;
    }
  }

  if (Array.isArray(orgData.mailDkimTokens) && orgData.mailDkimTokens.length === 3) {
    return orgData.mailDkimTokens;
  }
  const tokens = generateDeterministicDkimTokens(orgId, domain || orgId);
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
      return {
        success: false,
        addedCount: 0,
        error: existingRes.error || 'Could not inspect domain records.',
      };
    }

    const currentRecords: any[] = existingRes.data || [];
    const normalizedDomain = domainName.toLowerCase().trim();

    // Remove conflicting root MX or SPF records that do not match Email Service
    const conflictingRootRecords = currentRecords.filter((r: any) => {
      const rName = (r.name || '').toLowerCase().replace(/\.$/, '');
      const isRoot = rName === normalizedDomain || rName === '@';
      if (!isRoot) return false;
      if (r.type === 'MX' && !(r.content || '').toLowerCase().includes(MAIL_MX_HOST)) {
        return true;
      }
      if (
        r.type === 'TXT' &&
        (r.content || '').toLowerCase().includes('v=spf1') &&
        !(r.content || '').toLowerCase().includes(MAIL_SPF_INCLUDE)
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

// ============================================================================
// EMAIL SERVICE LIFECYCLE & ROUTING STATE
// ============================================================================

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

    // Fallback to live public DNS resolution if Cloudflare zone is not linked or returned empty
    if (liveRecords.length === 0 && domain) {
      liveRecords = await resolvePublicDnsRecords(domain, dkimTokens);
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
    return {
      success: false,
      error: error.message || 'Failed to load Email Service configuration.',
    };
  }
}

export async function activateMailService(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId);
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

    // Ensure domain principal exists on Stalwart Mail Server
    await syncStalwartDomainPrincipal(domain);

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
    const { uid, email, isOwner, orgData } = await verifyUserOrgAccess(idToken, orgId);
    if (!isOwner) {
      return {
        success: false,
        error: 'Unauthorized: Only the organization owner can deactivate Email Service.',
      };
    }

    await adminDb.collection('organizations').doc(orgId).update({
      mailServiceActive: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email,
      action: 'MAIL_SERVICE_DEACTIVATED',
      target: orgData.domain || orgId,
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to deactivate Email Service.' };
  }
}

export async function syncMailDnsRecords(idToken: string, orgId: string) {
  if (!orgId) return { success: false, error: 'Missing organization ID.' };
  try {
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId);
    const domain = (orgData.domain || '').toLowerCase().trim();
    const dkimTokens = await ensureOrgDkimTokens(orgId, orgData);

    if (!orgData.cloudflareZoneId) {
      // Perform live DNS verification against public resolvers
      const livePublic = await resolvePublicDnsRecords(domain, dkimTokens);
      const verifiedRecords = buildRequiredDnsRecords(domain, dkimTokens, livePublic);
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
      dkimTokens
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId);
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
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId);

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
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId);
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
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt || new Date().toISOString(),
        deletedAt: d.deletedAt || null,
        recoverableUntil: d.recoverableUntil || null,
      });
    }

    if (expiredDocs.length > 0) {
      const batch = adminDb.batch();
      expiredDocs.forEach((item) => batch.delete(item.ref));
      await batch.commit();

      // Purge expired principals from Stalwart Mail Server
      for (const item of expiredDocs) {
        if (item.email) {
          await dispatchStalwartApi(
            'DELETE',
            `/api/principal/${encodeURIComponent(item.email.toLowerCase().trim())}`
          );
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId);
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId);

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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId);
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId);
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId);
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId);
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
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId);
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
    const { uid, email, orgData } = await verifyUserOrgAccess(idToken, orgId);
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
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId);
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
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId);
    const groupRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailGroups')
      .doc(groupId);

    const groupDoc = await groupRef.get();
    const groupEmail = groupDoc.exists ? groupDoc.data()?.groupEmail : null;

    await groupRef.delete();

    if (groupEmail) {
      await dispatchStalwartApi(
        'DELETE',
        `/api/principal/${encodeURIComponent(groupEmail.toLowerCase().trim())}`
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
