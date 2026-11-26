'use server';

/**
 * @fileOverview Network Infrastructure Server Actions
 * Handles authenticated API interactions for domain status, BYOT (Bring Your Own Token),
 * edge record management, and safe-mode DNS snapshots & rollback.
 * Authenticates callers via Firebase ID token and asserts organization tenancy.
 */

import { assertStepUpMfa, verifyUserOrgAccess } from './auth-helper';
import { cfFetch } from './dns-client';
import { adminDb } from '@/firebase/admin';
import { encryptToken } from '@/lib/security/encryption';
import { FieldValue } from 'firebase-admin/firestore';

async function assertUniqueZoneBinding(zoneId: string, currentOrgId: string) {
  const existing = await adminDb
    .collection('organizations')
    .where('cloudflareZoneId', '==', zoneId)
    .limit(2)
    .get();
  const conflict = existing.docs.find((d) => d.id !== currentOrgId);
  if (conflict) {
    throw new Error('This Cloudflare zone is already bound to another Revlet organization.');
  }
}

async function fetchAllZoneRecords(zoneId: string, cfToken?: string): Promise<any[]> {
  const allRecords: any[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= 10) {
    const data = await cfFetch(`/zones/${zoneId}/dns_records?per_page=100&page=${page}`, {}, cfToken);
    if (Array.isArray(data.result)) {
      allRecords.push(...data.result);
    }
    totalPages = data.result_info?.total_pages || 1;
    page++;
  }
  return allRecords;
}


export async function getZoneDetails(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Read', 'DNS: Edit', 'DNS: Admin']);
    const data = await cfFetch(`/zones/${zoneId}`, {}, verified.cfToken);
    return {
      success: true,
      data: {
        status: data.result.status,
        nameServers: data.result.name_servers,
        originalNameServers: data.result.original_name_servers,
        paused: data.result.paused,
        type: data.result.type,
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch domain details' };
  }
}

export async function listDNSRecords(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Read', 'DNS: Edit', 'DNS: Admin']);
    let allRecords: any[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= 10) { // Safety cap at 1,000 records
      const data = await cfFetch(`/zones/${zoneId}/dns_records?per_page=100&page=${page}`, {}, verified.cfToken);
      if (Array.isArray(data.result)) {
        allRecords.push(...data.result);
      }
      totalPages = data.result_info?.total_pages || 1;
      page++;
    }

    return {
      success: true,
      data: allRecords.map((r: any) => {
        const item: any = {
          id: r.id,
          type: r.type,
          name: r.name,
          content: r.content,
          ttl: r.ttl === 1 ? 'Auto' : r.ttl.toString(),
          proxied: Boolean(r.proxied),
        };
        if (typeof r.priority === 'number' && !isNaN(r.priority)) {
          item.priority = r.priority;
        }
        return item;
      })
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to list domain settings' };
  }
}

export async function createDNSRecord(idToken: string, orgId: string, zoneId: string, record: any) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Edit', 'DNS: Admin']);

    const payload: any = {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl === 'Auto' ? 1 : parseInt(String(record.ttl), 10),
      proxied: !!record.proxied,
    };

    // Ensure priority is an integer for MX and SRV records
    if (record.type === 'MX' || record.type === 'SRV') {
      const parsedPriority = parseInt(String(record.priority ?? 10), 10);
      payload.priority = isNaN(parsedPriority) ? 10 : parsedPriority;
    }

    const data = await cfFetch(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, verified.cfToken);
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to apply domain setting' };
  }
}

export async function updateDNSRecord(idToken: string, orgId: string, zoneId: string, recordId: string, record: any) {
  if (!zoneId || !recordId) return { success: false, error: 'Missing Zone ID or Record ID' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Edit', 'DNS: Admin']);

    const payload: any = {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl === 'Auto' ? 1 : parseInt(String(record.ttl), 10),
      proxied: !!record.proxied,
    };

    // Ensure priority is an integer for MX and SRV records
    if (record.type === 'MX' || record.type === 'SRV') {
      const parsedPriority = parseInt(String(record.priority ?? 10), 10);
      payload.priority = isNaN(parsedPriority) ? 10 : parsedPriority;
    }

    const data = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, verified.cfToken);
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update domain setting' };
  }
}

export async function deleteDNSRecord(idToken: string, orgId: string, zoneId: string, recordId: string) {
  if (!zoneId || !recordId) return { success: false, error: 'Missing Zone ID or Record ID' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Edit', 'DNS: Admin']);

    const data = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
    }, verified.cfToken);

    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to remove domain setting' };
  }
}

export async function createZone(idToken: string, orgId: string, domainName: string) {
  if (!domainName) return { success: false, error: 'No domain name provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, undefined, ['DNS: Admin']);
    const targetDomain = verified.orgData?.domain?.toLowerCase()?.trim();
    if (targetDomain && targetDomain !== domainName.toLowerCase().trim()) {
      throw new Error(`Domain "${domainName}" does not match the active organization domain.`);
    }

    // 1. Resolve Account ID from environment or Cloudflare API
    let accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    if (!accountId) {
      try {
        const accountsData = await cfFetch('/accounts', {}, verified.cfToken);
        accountId = accountsData.result?.[0]?.id;
      } catch {
        // Scoped tokens might not have permission to list accounts directly
      }
    }
    
    if (!accountId) {
      throw new Error("No Cloudflare account found. Ensure CLOUDFLARE_ACCOUNT_ID is set in your environment.");
    }

    // 2. Idempotency check: reuse existing zone if already registered on this Cloudflare account
    const cleanDomain = domainName.toLowerCase().trim();
    const orgRef = adminDb.collection('organizations').doc(orgId);
    const persistManagedBinding = async (zoneId: string, nameServers: string[]) => {
      await assertUniqueZoneBinding(zoneId, orgId);
      await orgRef.update({
        cloudflareZoneId: zoneId,
        cloudflareZoneName: cleanDomain,
        dnsMode: 'managed',
        dnsRequested: true,
        nameservers: nameServers,
        updatedAt: new Date().toISOString(),
      });
    };

    try {
      const existingRes = await cfFetch(`/zones?name=${encodeURIComponent(cleanDomain)}`, {}, verified.cfToken);
      const existingZone = Array.isArray(existingRes.result)
        ? existingRes.result.find((z: any) => z.name?.toLowerCase().trim() === cleanDomain)
        : null;
      if (existingZone) {
        const ns = existingZone.name_servers || [];
        await persistManagedBinding(existingZone.id, ns);
        return {
          success: true,
          data: {
            id: existingZone.id,
            nameServers: ns,
          },
        };
      }
    } catch (lookupErr: any) {
      if (lookupErr?.message?.includes('already bound')) {
        throw lookupErr;
      }
      // Proceed to zone creation if lookup fails
    }

    // 3. Create the zone and persist the server-owned binding
    const zoneData = await cfFetch('/zones', {
      method: 'POST',
      body: JSON.stringify({
        name: cleanDomain,
        account: { id: accountId },
        type: 'full'
      }),
    }, verified.cfToken);

    const createdNs = zoneData.result.name_servers || [];
    await persistManagedBinding(zoneData.result.id, createdNs);

    return {
      success: true,
      data: {
        id: zoneData.result.id,
        nameServers: createdNs
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to connect domain' };
  }
}

// =========================================================================
// BRING YOUR OWN CLOUDFLARE TOKEN (BYOT) ENTERPRISE INTEGRATION
// =========================================================================

/**
 * Verifies a customer-provided scoped Cloudflare API token, confirms its scope
 * covers the organization's domain, encrypts it using AES-256-GCM, and stores
 * the envelope in Firestore.
 */
export async function verifyAndConnectCloudflareToken(idToken: string, orgId: string, apiToken: string) {
  if (!apiToken?.trim()) {
    return { success: false, error: 'Cloudflare API Token is required.' };
  }
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId);
    if (!verified.isOwner) {
      return { success: false, error: 'Only organization owners can connect an edge API token.' };
    }

    const cleanToken = apiToken.trim();
    const domain = verified.orgData?.domain?.toLowerCase()?.trim();
    if (!domain) {
      return { success: false, error: 'Organization does not have a primary domain configured.' };
    }

    // Step 1: Live Token Verification via GET /user/tokens/verify
    const verifyRes = await cfFetch('/user/tokens/verify', {}, cleanToken);
    if (!verifyRes || verifyRes.result?.status !== 'active') {
      return { 
        success: false, 
        error: 'Cloudflare token verification failed. Please verify the token is active and not expired.' 
      };
    }
    const expiresOn = verifyRes.result?.expires_on || null;

    // Step 2: Query matching zone via GET /zones?name=... (avoids 20-zone default pagination miss)
    const zonesRes = await cfFetch(`/zones?name=${encodeURIComponent(domain)}&per_page=50`, {}, cleanToken);
    let zones: any[] = Array.isArray(zonesRes.result) ? zonesRes.result : [];
    let matchedZone = zones.find((z: any) => z.name?.toLowerCase().trim() === domain);

    if (!matchedZone) {
      const fallbackRes = await cfFetch('/zones?per_page=50', {}, cleanToken);
      zones = Array.isArray(fallbackRes.result) ? fallbackRes.result : [];
      if (zones.length === 0) {
        return {
          success: false,
          error: 'The provided token has no Zone access. Please ensure "Zone: Zone (Read)" and "Zone: DNS (Edit)" permissions are assigned to your zone.'
        };
      }
      matchedZone = zones.find((z: any) => z.name?.toLowerCase().trim() === domain);
    }

    if (!matchedZone) {
      const accessibleNames = zones.map((z: any) => z.name).slice(0, 3).join(', ');
      return {
        success: false,
        error: `Token does not have access to zone "${domain}". Accessible zones on this token: ${accessibleNames || 'none'}. Please ensure your token Zone Resources includes "${domain}".`
      };
    }

    // Enforce unique tenant-to-zone mapping before binding
    await assertUniqueZoneBinding(matchedZone.id, orgId);

    // Step 3: Envelope Encryption using AES-256-GCM
    const encrypted = encryptToken(cleanToken);

    // Step 4: Store encrypted token in server-only secrets subcollection, and non-sensitive audit metadata on org doc
    const orgRef = adminDb.collection('organizations').doc(orgId);
    const verifiedAt = new Date().toISOString();
    const tokenAuditMeta = {
      masked: encrypted.masked,
      verifiedAt,
      expiresOn,
      zoneId: matchedZone.id,
      zoneName: matchedZone.name,
      zoneStatus: matchedZone.status,
      scopedZoneCount: zones.length
    };

    await orgRef.collection('secrets').doc('cloudflare').set({
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      ...tokenAuditMeta,
    });

    await orgRef.update({
      cloudflareZoneId: matchedZone.id,
      cloudflareZoneName: matchedZone.name,
      dnsMode: 'byot',
      cloudflareTokenAudit: tokenAuditMeta,
      cloudflareTokenEncrypted: FieldValue.delete(),
      dnsRequested: true,
      updatedAt: verifiedAt
    });

    // Step 5: Automatically create a complete paginated baseline snapshot
    try {
      const allRawRecords = await fetchAllZoneRecords(matchedZone.id, cleanToken);
      const initialRecords = sanitizeDNSRecordsForFirestore(allRawRecords);

      await orgRef.collection('dns_snapshots').add({
        createdAt: new Date().toISOString(),
        reason: 'Initial BYOT connection baseline',
        recordCount: initialRecords.length,
        records: initialRecords,
        createdById: verified.uid
      });
    } catch (snapErr) {
      console.warn('[BYOT] Initial snapshot baseline warning:', snapErr);
    }

    return {
      success: true,
      data: {
        zoneId: matchedZone.id,
        zoneName: matchedZone.name,
        zoneStatus: matchedZone.status,
        nameServers: matchedZone.name_servers,
        masked: encrypted.masked,
        expiresOn,
        scopedZoneCount: zones.length
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to verify and connect Cloudflare token.' };
  }
}

/**
 * Disconnects DNS management and revokes the stored Cloudflare token while
 * preserving DNS snapshot history for audit and future recovery.
 */
export async function disconnectCloudflareToken(idToken: string, orgId: string) {
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId);
    if (!verified.isOwner) {
      return { success: false, error: 'Only organization owners can disable DNS management.' };
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);

    // Preserve dns_snapshots history; revoke secret and clear active zone binding
    await orgRef.collection('secrets').doc('cloudflare').delete().catch(() => null);
    await orgRef.update({
      cloudflareTokenEncrypted: FieldValue.delete(),
      cloudflareTokenAudit: FieldValue.delete(),
      cloudflareZoneId: FieldValue.delete(),
      cloudflareZoneName: FieldValue.delete(),
      cloudflareTokenVerifiedAt: FieldValue.delete(),
      cloudflareTokenExpiresOn: FieldValue.delete(),
      cloudflareTokenScopedZone: FieldValue.delete(),
      dnsMode: FieldValue.delete(),
      dnsRequested: FieldValue.delete(),
      nameservers: FieldValue.delete(),
      updatedAt: new Date().toISOString()
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to disable DNS service.' };
  }
}

/**
 * Background check verifying that the active DNS token (platform or BYOT) is still valid
 * and retains the required Zone & DNS permissions for the organization.
 */
export async function verifyDnsTokenPermissions(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: true, data: { valid: false, message: 'No active zone configured.' } };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Read', 'DNS: Edit', 'DNS: Admin']);
    const token = verified.cfToken;
    if (!token) {
      return {
        success: true,
        data: {
          valid: false,
          message: 'No active access credentials found. Please reconnect your DNS service.',
        },
      };
    }

    // 1. Verify token is active and not expired
    const verifyRes = await cfFetch('/user/tokens/verify', {}, token);
    if (!verifyRes?.result || verifyRes.result.status !== 'active') {
      return {
        success: true,
        data: {
          valid: false,
          message: 'Access credentials are inactive or expired. DNS modifications have been disabled.',
        },
      };
    }

    // 2. Verify Zone Read and DNS Records access
    await Promise.all([
      cfFetch(`/zones/${zoneId}`, {}, token),
      cfFetch(`/zones/${zoneId}/dns_records?per_page=1`, {}, token),
    ]);

    return { success: true, data: { valid: true } };
  } catch (error: any) {
    return {
      success: true,
      data: {
        valid: false,
        message: error?.message || 'Required DNS permissions are missing or invalid. Actions are disabled.',
      },
    };
  }
}

/**
 * Returns the non-sensitive token audit metadata for the verified badge.
 */
export async function getCloudflareTokenAudit(idToken: string, orgId: string) {
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, undefined, ['DNS: Read', 'DNS: Edit', 'DNS: Admin']);
    const tokenMeta = verified.orgData?.cloudflareTokenAudit || verified.orgData?.cloudflareTokenEncrypted;
    if (!tokenMeta || (!tokenMeta.masked && !tokenMeta.ciphertext)) {
      return { 
        success: true, 
        data: { 
          isConnected: false,
          isByot: verified.orgData?.dnsMode === 'byot'
        } 
      };
    }

    return {
      success: true,
      data: {
        isConnected: true,
        isByot: true,
        masked: tokenMeta.masked || 'cf_••••••',
        verifiedAt: tokenMeta.verifiedAt,
        expiresOn: tokenMeta.expiresOn,
        zoneName: tokenMeta.zoneName || verified.orgData?.domain,
        zoneId: tokenMeta.zoneId || verified.orgData?.cloudflareZoneId,
        scopedZoneCount: tokenMeta.scopedZoneCount || 1,
        zeroBillingAccess: true
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch token audit.' };
  }
}

// =========================================================================
// SAFE-MODE DNS GUARDRAILS & ROLLBACK SNAPSHOTS
// =========================================================================

/**
 * Strips undefined properties and normalizes record types so Firestore never throws.
 */
function sanitizeDNSRecordsForFirestore(records: any[]) {
  if (!Array.isArray(records)) return [];
  return records.map((r: any) => {
    const item: any = {
      id: String(r.id || ''),
      type: String(r.type || 'A'),
      name: String(r.name || ''),
      content: String(r.content || ''),
      ttl: r.ttl === 1 ? 'Auto' : String(r.ttl ?? 'Auto'),
      proxied: Boolean(r.proxied),
    };
    if (typeof r.priority === 'number' && !isNaN(r.priority)) {
      item.priority = r.priority;
    }
    return item;
  });
}

/**
 * Creates an exportable JSON snapshot of the current zone records.
 */
export async function createZoneSnapshot(idToken: string, orgId: string, zoneId: string, reason: string = 'Manual snapshot') {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Edit', 'DNS: Admin']);
    const recordsRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!recordsRes.success || !recordsRes.data) throw new Error(recordsRes.error || 'Failed to fetch DNS records');

    const records = sanitizeDNSRecordsForFirestore(recordsRes.data);
    const createdAt = new Date().toISOString();
    const snapshotDoc = await adminDb.collection('organizations').doc(orgId).collection('dns_snapshots').add({
      createdAt,
      reason,
      recordCount: records.length,
      records,
      createdById: verified.uid
    });

    return { success: true, data: { id: snapshotDoc.id, recordCount: records.length, createdAt } };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create snapshot.' };
  }
}

/**
 * Lists the most recent 10 snapshots for rollback.
 */
export async function listZoneSnapshots(idToken: string, orgId: string) {
  try {
    await verifyUserOrgAccess(idToken, orgId, undefined, ['DNS: Read', 'DNS: Edit', 'DNS: Admin']);
    const snap = await adminDb.collection('organizations').doc(orgId).collection('dns_snapshots')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const snapshots = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        createdAt: data.createdAt,
        reason: data.reason || 'Snapshot',
        recordCount: data.recordCount || (data.records ? data.records.length : 0)
      };
    });

    return { success: true, data: snapshots };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to list snapshots.' };
  }
}

function recordSignature(r: any): string {
  const ttlNorm = r.ttl === 'Auto' || r.ttl === 1 || r.ttl === '1' ? 1 : parseInt(String(r.ttl || 1), 10) || 1;
  const prioNorm =
    r.type === 'MX' || r.type === 'SRV'
      ? String(parseInt(String(r.priority ?? 10), 10) || 10)
      : '';
  return [
    String(r.type || '').toUpperCase(),
    String(r.name || '').toLowerCase(),
    String(r.content || ''),
    String(ttlNorm),
    r.proxied ? '1' : '0',
    prioNorm,
  ].join('|');
}

/**
 * Atomic Rollback: Reconciles live zone records against a selected snapshot using
 * Cloudflare's batch API and full-field comparison (type, name, content, TTL, proxy, priority).
 * Requires DNS: Admin permission and recent Step-Up MFA verification.
 */
export async function rollbackZoneSnapshot(
  idToken: string,
  orgId: string,
  zoneId: string,
  snapshotId: string,
  stepUpToken?: string
) {
  if (!zoneId || !snapshotId) return { success: false, error: 'Missing parameters' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Admin']);
    assertStepUpMfa(verified.uid, stepUpToken);

    // 1. Fetch snapshot
    const snapDoc = await adminDb.collection('organizations').doc(orgId).collection('dns_snapshots').doc(snapshotId).get();
    if (!snapDoc.exists) {
      return { success: false, error: 'Snapshot not found' };
    }
    const snapData = snapDoc.data();
    const targetRecords: any[] = snapData?.records || [];

    // 2. Fetch complete live records
    const currentRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!currentRes.success) throw new Error(currentRes.error);
    const currentRecords: any[] = currentRes.data || [];

    // 3. Pre-rollback safety backup of current state
    const cleanCurrentRecords = sanitizeDNSRecordsForFirestore(currentRecords);
    await adminDb.collection('organizations').doc(orgId).collection('dns_snapshots').add({
      createdAt: new Date().toISOString(),
      reason: `Pre-rollback backup before restoring snapshot (${snapData?.reason || snapshotId.slice(0, 6)})`,
      recordCount: cleanCurrentRecords.length,
      records: cleanCurrentRecords,
      createdById: verified.uid
    });

    // 4. Compute exact full-field diff (type, name, content, TTL, proxied, priority)
    const targetSigCounts = new Map<string, number>();
    for (const t of targetRecords) {
      const sig = recordSignature(t);
      targetSigCounts.set(sig, (targetSigCounts.get(sig) || 0) + 1);
    }

    const deletes: Array<{ id: string }> = [];
    const matchedSigCounts = new Map<string, number>();
    for (const cur of currentRecords) {
      const sig = recordSignature(cur);
      const needed = targetSigCounts.get(sig) || 0;
      const alreadyMatched = matchedSigCounts.get(sig) || 0;
      if (alreadyMatched < needed) {
        matchedSigCounts.set(sig, alreadyMatched + 1);
      } else if (cur.id) {
        deletes.push({ id: cur.id });
      }
    }

    const posts: any[] = [];
    const createdSigCounts = new Map<string, number>(matchedSigCounts);
    for (const target of targetRecords) {
      const sig = recordSignature(target);
      const have = createdSigCounts.get(sig) || 0;
      const needed = targetSigCounts.get(sig) || 0;
      if (have < needed) {
        createdSigCounts.set(sig, have + 1);
        const payload: any = {
          type: target.type,
          name: target.name,
          content: target.content,
          ttl: target.ttl === 'Auto' || target.ttl === 1 ? 1 : parseInt(String(target.ttl), 10) || 1,
          proxied: Boolean(target.proxied),
        };
        if (target.type === 'MX' || target.type === 'SRV') {
          const p = parseInt(String(target.priority ?? 10), 10);
          payload.priority = isNaN(p) ? 10 : p;
        }
        posts.push(payload);
      }
    }

    if (deletes.length > 0 || posts.length > 0) {
      await cfFetch(
        `/zones/${zoneId}/dns_records/batch`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...(deletes.length > 0 ? { deletes } : {}),
            ...(posts.length > 0 ? { posts } : {}),
          }),
        },
        verified.cfToken
      );
    }

    return {
      success: true,
      data: {
        restoredCount: posts.length,
        deletedCount: deletes.length,
        snapshotReason: snapData?.reason,
        snapshotDate: snapData?.createdAt
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Rollback failed.' };
  }
}

const IMPORT_SUPPORTED_TYPES = new Set([
  'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR', 'SPF', 'TLSA', 'HTTPS', 'SVCB', 'URI', 'LOC', 'NAPTR'
]);
const IMPORT_PROXY_TYPES = new Set(['A', 'AAAA', 'CNAME']);

/**
 * Server-side BIND zone file importer with TTL and priority preservation,
 * per-line diagnostics, and verified provider result reporting.
 */
export async function importZoneFileRecords(
  idToken: string,
  orgId: string,
  zoneId: string,
  zoneFileText: string,
  proxyAllImported = false
) {
  if (!zoneId || !zoneFileText?.trim()) {
    return { success: false, error: 'Zone file is empty.' };
  }
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Edit', 'DNS: Admin']);
    const lines = zoneFileText.split(/\r?\n/);
    const posts: any[] = [];
    const diagnostics: Array<{ line: number; status: 'queued' | 'skipped' | 'error'; message: string }> = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const rawLine = lines[idx].trim();
      const lineNum = idx + 1;
      if (!rawLine || rawLine.startsWith(';') || rawLine.startsWith('$')) continue;

      const withoutComment = rawLine.replace(/\s+;.*$/, '').trim();
      const parts = withoutComment.split(/\s+/);
      if (parts.length < 4) {
        diagnostics.push({ line: lineNum, status: 'skipped', message: 'Incomplete record line.' });
        continue;
      }

      const name = parts[0].replace(/\.$/, '');
      const inIdx = parts.findIndex((p) => p.toUpperCase() === 'IN');
      let ttl = 1;
      let typeIdx = 2;

      if (inIdx > 0) {
        typeIdx = inIdx + 1;
        if (inIdx >= 2 && /^\d+$/.test(parts[1])) {
          const parsedTtl = parseInt(parts[1], 10);
          ttl = parsedTtl >= 60 ? parsedTtl : 1;
        }
      } else if (/^\d+$/.test(parts[1])) {
        const parsedTtl = parseInt(parts[1], 10);
        ttl = parsedTtl >= 60 ? parsedTtl : 1;
        typeIdx = 2;
      } else {
        typeIdx = 1;
      }

      const type = (parts[typeIdx] || '').toUpperCase();
      if (type === 'SOA') {
        diagnostics.push({ line: lineNum, status: 'skipped', message: 'SOA record skipped.' });
        continue;
      }
      if (!IMPORT_SUPPORTED_TYPES.has(type)) {
        diagnostics.push({ line: lineNum, status: 'skipped', message: `Unsupported record type: ${type || 'unknown'}.` });
        continue;
      }

      const rest = parts.slice(typeIdx + 1);
      if (rest.length === 0) {
        diagnostics.push({ line: lineNum, status: 'error', message: `Missing content for ${type} record.` });
        continue;
      }

      const payload: any = {
        type,
        name,
        ttl,
        proxied: proxyAllImported && IMPORT_PROXY_TYPES.has(type),
      };

      if (type === 'MX') {
        const prio = parseInt(rest[0], 10);
        if (!isNaN(prio) && rest.length >= 2) {
          payload.priority = prio;
          payload.content = rest.slice(1).join(' ').replace(/\.$/, '');
        } else {
          payload.priority = 10;
          payload.content = rest.join(' ').replace(/\.$/, '');
        }
      } else if (type === 'TXT') {
        payload.content = rest.join(' ').replace(/^"|"$/g, '');
      } else {
        payload.content = rest.join(' ').replace(/\.$/, '');
      }

      posts.push(payload);
      diagnostics.push({ line: lineNum, status: 'queued', message: `${type} ${name}` });
    }

    if (posts.length === 0) {
      return {
        success: false,
        error: 'No valid DNS records found in zone file.',
        data: { created: 0, failed: 0, diagnostics },
      };
    }

    let created = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < posts.length; i += 50) {
      const chunk = posts.slice(i, i + 50);
      try {
        const batchRes = await cfFetch(
          `/zones/${zoneId}/dns_records/batch`,
          {
            method: 'POST',
            body: JSON.stringify({ posts: chunk }),
          },
          verified.cfToken
        );
        const createdBatch = Array.isArray(batchRes.result?.posts) ? batchRes.result.posts.length : chunk.length;
        created += createdBatch;
      } catch {
        for (const rec of chunk) {
          try {
            await cfFetch(
              `/zones/${zoneId}/dns_records`,
              { method: 'POST', body: JSON.stringify(rec) },
              verified.cfToken
            );
            created++;
          } catch (recErr: any) {
            failed++;
            errors.push(`${rec.type} ${rec.name}: ${recErr?.message || 'Rejected'}`);
          }
        }
      }
    }

    return {
      success: created > 0 || failed === 0,
      data: {
        created,
        failed,
        diagnostics: diagnostics.slice(0, 50),
        errors: errors.slice(0, 10),
      },
      ...(created === 0 && failed > 0 ? { error: errors[0] || 'All imported records were rejected by Cloudflare.' } : {}),
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Zone file import failed.' };
  }
}

export async function autoConfigureEmailDNS(idToken: string, orgId: string, zoneId: string, domainName: string) {
  if (!zoneId || !domainName) return { success: false, error: 'Missing parameters' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Admin']);
    
    // Automatically snapshot before auto-configuring email DNS
    try {
      await createZoneSnapshot(idToken, orgId, zoneId, 'Pre-email DNS auto-configuration backup');
    } catch (snapErr) {
      console.warn('[Safety] Snapshot warning prior to email DNS config:', snapErr);
    }

    const recordsRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!recordsRes.success) throw new Error(recordsRes.error);
    const records = recordsRes.data || [];

    // Delete conflicting records
    const conflictingRecords = records.filter((r: any) => {
      const isRoot = r.name === domainName || r.name === `@`;
      if (!isRoot) return false;
      if (r.type === 'MX') return true;
      if (r.type === 'TXT' && r.content.includes('v=spf1')) return true;
      return false;
    });

    for (const r of conflictingRecords) {
      await deleteDNSRecord(idToken, orgId, zoneId, r.id);
    }

    // Create required records for Revlet Mail Server + AWS SES Outbound
    const requiredRecords = [
      { type: 'MX', name: domainName, content: 'mx.revlet.me', priority: 10, ttl: 'Auto', proxied: false },
      { type: 'TXT', name: domainName, content: 'v=spf1 include:_spf.mx.revlet.me ~all', ttl: 'Auto', proxied: false }
    ];

    for (const rec of requiredRecords) {
      await createDNSRecord(idToken, orgId, zoneId, rec);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to configure DNS records' };
  }
}
