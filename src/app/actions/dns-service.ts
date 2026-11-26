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

async function claimZoneBindingTransaction(params: {
  zoneId: string;
  orgId: string;
  domain: string;
  mode: 'managed' | 'byot';
  uid: string;
  accountId?: string;
  orgUpdate: Record<string, any>;
}) {
  const bindingRef = adminDb.collection('system_zone_bindings').doc(params.zoneId);
  const orgRef = adminDb.collection('organizations').doc(params.orgId);

  await adminDb.runTransaction(async (tx) => {
    const bindingSnap = await tx.get(bindingRef);
    if (bindingSnap.exists && bindingSnap.data()?.orgId && bindingSnap.data()?.orgId !== params.orgId) {
      throw new Error('This Cloudflare zone is already bound to another Revlet organization.');
    }

    // Legacy guard: check if any other organization doc already references this zoneId
    const legacyConflict = await adminDb
      .collection('organizations')
      .where('cloudflareZoneId', '==', params.zoneId)
      .limit(2)
      .get();
    if (legacyConflict.docs.some((d) => d.id !== params.orgId)) {
      throw new Error('This Cloudflare zone is already bound to another Revlet organization.');
    }

    tx.set(
      bindingRef,
      {
        zoneId: params.zoneId,
        orgId: params.orgId,
        domain: params.domain,
        mode: params.mode,
        ...(params.accountId ? { accountId: params.accountId } : {}),
        claimedByUid: params.uid,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    tx.update(orgRef, params.orgUpdate);
  });
}

async function fetchAllZoneRecords(
  zoneId: string,
  cfToken?: string
): Promise<{ records: any[]; isComplete: boolean }> {
  const allRecords: any[] = [];
  let page = 1;
  let totalPages = 1;
  const MAX_PAGES = 10;
  while (page <= totalPages && page <= MAX_PAGES) {
    const data = await cfFetch(`/zones/${zoneId}/dns_records?per_page=100&page=${page}`, {}, cfToken);
    if (Array.isArray(data.result)) {
      allRecords.push(...data.result);
    }
    totalPages = data.result_info?.total_pages || 1;
    page++;
  }
  return { records: allRecords, isComplete: page > totalPages };
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

export async function updateDNSRecord(
  idToken: string,
  orgId: string,
  zoneId: string,
  recordId: string,
  record: any,
  expectedPrevious?: {
    type?: string;
    name?: string;
    content?: string;
    ttl?: string | number;
    proxied?: boolean;
    priority?: number;
  }
) {
  if (!zoneId || !recordId) return { success: false, error: 'Missing Zone ID or Record ID' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Edit', 'DNS: Admin']);

    // Stale-change drift guard: verify the live provider record still matches what the user reviewed
    if (expectedPrevious) {
      const liveRes = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {}, verified.cfToken);
      const liveRec = liveRes?.result;
      if (!liveRec) {
        return {
          success: false,
          error: 'Record no longer exists at Cloudflare. Refresh DNS records before editing.',
        };
      }
      if (recordSignature(liveRec) !== recordSignature(expectedPrevious)) {
        return {
          success: false,
          error:
            'DRIFT_DETECTED: This DNS record was modified externally since you loaded it. Refresh and review the latest values before publishing.',
        };
      }
    }

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

    // 2. Prevent unverified adoption of pre-existing Cloudflare zones:
    // Only reuse an existing zone if THIS organization already holds the verified binding.
    const cleanDomain = domainName.toLowerCase().trim();
    const persistManagedBinding = async (zoneId: string, nameServers: string[]) => {
      await claimZoneBindingTransaction({
        zoneId,
        orgId,
        domain: cleanDomain,
        mode: 'managed',
        uid: verified.uid,
        accountId,
        orgUpdate: {
          cloudflareZoneId: zoneId,
          cloudflareZoneName: cleanDomain,
          dnsMode: 'managed',
          dnsRequested: true,
          nameservers: nameServers,
          updatedAt: new Date().toISOString(),
        },
      });
    };

    const existingRes = await cfFetch(`/zones?name=${encodeURIComponent(cleanDomain)}`, {}, verified.cfToken);
    const existingZone = Array.isArray(existingRes.result)
      ? existingRes.result.find((z: any) => z.name?.toLowerCase().trim() === cleanDomain)
      : null;

    if (existingZone) {
      const existingBindingSnap = await adminDb.collection('system_zone_bindings').doc(existingZone.id).get();
      const alreadyOwnedByThisOrg =
        verified.orgData?.cloudflareZoneId === existingZone.id ||
        (existingBindingSnap.exists && existingBindingSnap.data()?.orgId === orgId);

      if (!alreadyOwnedByThisOrg) {
        return {
          success: false,
          error:
            `A Cloudflare zone for "${cleanDomain}" already exists and cannot be adopted without verified ownership. Connect your own scoped Cloudflare API token (BYOT) to prove domain control.`,
        };
      }

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

    // 3. Create a fresh zone and transactionally reserve the binding
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
export async function verifyAndConnectCloudflareToken(
  idToken: string,
  orgId: string,
  apiToken: string,
  stepUpToken?: string
) {
  if (!apiToken?.trim()) {
    return { success: false, error: 'Cloudflare API Token is required.' };
  }
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId);
    if (!verified.isOwner) {
      return { success: false, error: 'Only organization owners can connect an edge API token.' };
    }
    assertStepUpMfa(verified.uid, stepUpToken);

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

    // Step 3: Envelope Encryption using AES-256-GCM
    const encrypted = encryptToken(cleanToken);

    // Step 4: Transactionally claim zone binding, store encrypted token in server-only secrets subcollection
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

    await claimZoneBindingTransaction({
      zoneId: matchedZone.id,
      orgId,
      domain: matchedZone.name || domain,
      mode: 'byot',
      uid: verified.uid,
      accountId: matchedZone.account?.id,
      orgUpdate: {
        cloudflareZoneId: matchedZone.id,
        cloudflareZoneName: matchedZone.name,
        dnsMode: 'byot',
        cloudflareTokenAudit: tokenAuditMeta,
        cloudflareTokenEncrypted: FieldValue.delete(),
        dnsRequested: true,
        updatedAt: verifiedAt,
      },
    });

    await orgRef.collection('secrets').doc('cloudflare').set({
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      ...tokenAuditMeta,
    });

    // Step 5: Automatically create a complete paginated baseline snapshot with zone metadata
    try {
      const { records: allRawRecords, isComplete } = await fetchAllZoneRecords(matchedZone.id, cleanToken);
      const initialRecords = sanitizeDNSRecordsForFirestore(allRawRecords);

      await orgRef.collection('dns_snapshots').add({
        createdAt: new Date().toISOString(),
        reason: 'Initial BYOT connection baseline',
        zoneId: matchedZone.id,
        domain: matchedZone.name || domain,
        schemaVersion: 2,
        isComplete,
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
export async function disconnectCloudflareToken(
  idToken: string,
  orgId: string,
  stepUpToken?: string
) {
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId);
    if (!verified.isOwner) {
      return { success: false, error: 'Only organization owners can disable DNS management.' };
    }
    assertStepUpMfa(verified.uid, stepUpToken);

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const secretRef = orgRef.collection('secrets').doc('cloudflare');

    // Atomically clear organization binding, stored Cloudflare secret, and zone reservation
    // in a single Firestore transaction so partial state cannot linger.
    await adminDb.runTransaction(async (tx) => {
      const freshOrgSnap = await tx.get(orgRef);
      if (!freshOrgSnap.exists) {
        throw new Error('Organization not found.');
      }
      const prevZoneId = freshOrgSnap.data()?.cloudflareZoneId;
      if (prevZoneId) {
        const bindingRef = adminDb.collection('system_zone_bindings').doc(String(prevZoneId));
        const bindingSnap = await tx.get(bindingRef);
        if (bindingSnap.exists && bindingSnap.data()?.orgId === orgId) {
          tx.delete(bindingRef);
        }
      }

      tx.delete(secretRef);
      tx.update(orgRef, {
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
        updatedAt: new Date().toISOString(),
      });
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
    if (r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
      // Preserve provider-specific structured fields (SRV, CAA, HTTPS, SVCB, TLSA, NAPTR, LOC, URI)
      const cleanData: Record<string, any> = {};
      for (const [k, v] of Object.entries(r.data)) {
        if (v !== undefined) cleanData[k] = v;
      }
      if (Object.keys(cleanData).length > 0) {
        item.data = cleanData;
      }
    }
    if (typeof r.comment === 'string' && r.comment.trim()) {
      item.comment = r.comment.trim();
    }
    return item;
  });
}

/**
 * Creates a zone-scoped, completeness-tracked JSON snapshot of the current zone records.
 */
export async function createZoneSnapshot(idToken: string, orgId: string, zoneId: string, reason: string = 'Manual snapshot') {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Edit', 'DNS: Admin']);
    const { records: rawRecords, isComplete } = await fetchAllZoneRecords(zoneId, verified.cfToken);

    const records = sanitizeDNSRecordsForFirestore(rawRecords);
    const createdAt = new Date().toISOString();
    const snapshotDoc = await adminDb.collection('organizations').doc(orgId).collection('dns_snapshots').add({
      createdAt,
      reason,
      zoneId,
      domain: verified.orgData?.cloudflareZoneName || verified.orgData?.domain || '',
      schemaVersion: 2,
      isComplete,
      recordCount: records.length,
      records,
      createdById: verified.uid
    });

    return { success: true, data: { id: snapshotDoc.id, recordCount: records.length, isComplete, createdAt } };
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

    // 1. Fetch & validate snapshot (completeness + zone ownership)
    const snapDoc = await adminDb.collection('organizations').doc(orgId).collection('dns_snapshots').doc(snapshotId).get();
    if (!snapDoc.exists) {
      return { success: false, error: 'Snapshot not found' };
    }
    const snapData = snapDoc.data();
    if (snapData?.isComplete === false) {
      return {
        success: false,
        error: 'This snapshot is incomplete (exceeded the 1,000-record capture cap) and cannot be used for a destructive restore.',
      };
    }
    if (snapData?.zoneId && snapData.zoneId !== zoneId) {
      return {
        success: false,
        error: 'This snapshot belongs to a different Cloudflare zone and cannot be restored onto the current zone.',
      };
    }
    const targetRecords: any[] = snapData?.records || [];

    // 2. Fetch complete live records directly from Cloudflare
    const { records: currentRecords, isComplete: liveIsComplete } = await fetchAllZoneRecords(zoneId, verified.cfToken);
    if (!liveIsComplete) {
      return {
        success: false,
        error: 'Live zone exceeds the 1,000-record safety cap for automated rollback. Perform targeted updates instead.',
      };
    }

    // 3. Pre-rollback safety backup of current state (with zoneId + completeness)
    const cleanCurrentRecords = sanitizeDNSRecordsForFirestore(currentRecords);
    await adminDb.collection('organizations').doc(orgId).collection('dns_snapshots').add({
      createdAt: new Date().toISOString(),
      reason: `Pre-rollback backup before restoring snapshot (${snapData?.reason || snapshotId.slice(0, 6)})`,
      zoneId,
      domain: verified.orgData?.cloudflareZoneName || verified.orgData?.domain || '',
      schemaVersion: 2,
      isComplete: true,
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

function tokenizeBindLine(line: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let inQuote = false;
  let escape = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escape) {
      cur += ch;
      escape = false;
      continue;
    }
    if (ch === '\\' && inQuote) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (!inQuote && ch === ';') {
      break; // Comment outside quotes
    }
    if (!inQuote && /\s/.test(ch)) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function unfoldBindLines(rawText: string): Array<{ lineNum: number; text: string }> {
  const rawLines = rawText.split(/\r?\n/);
  const unfolded: Array<{ lineNum: number; text: string }> = [];
  let acc = '';
  let startLine = 1;
  let parenDepth = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (parenDepth === 0) startLine = i + 1;

    let inQuote = false;
    let escape = false;
    let cleaned = '';
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (escape) {
        cleaned += ch;
        escape = false;
        continue;
      }
      if (ch === '\\' && inQuote) {
        cleaned += ch;
        escape = true;
        continue;
      }
      if (ch === '"') {
        inQuote = !inQuote;
        cleaned += ch;
        continue;
      }
      if (!inQuote && ch === ';') break;
      if (!inQuote && ch === '(') {
        parenDepth++;
        cleaned += ' ';
        continue;
      }
      if (!inQuote && ch === ')') {
        parenDepth = Math.max(0, parenDepth - 1);
        cleaned += ' ';
        continue;
      }
      cleaned += ch;
    }

    acc = acc ? `${acc} ${cleaned.trim()}` : cleaned.trim();
    if (parenDepth === 0) {
      if (acc.trim()) unfolded.push({ lineNum: startLine, text: acc.trim() });
      acc = '';
    }
  }
  if (acc.trim()) unfolded.push({ lineNum: startLine, text: acc.trim() });
  return unfolded;
}

function expandBindName(rawName: string, origin: string): string {
  const cleanOrigin = origin.replace(/\.$/, '').trim();
  if (!rawName || rawName === '@') return cleanOrigin;
  if (rawName.endsWith('.')) return rawName.replace(/\.$/, '');
  return cleanOrigin ? `${rawName}.${cleanOrigin}` : rawName;
}

/**
 * Server-side BIND zone file importer supporting $ORIGIN, $TTL, multiline (...) records,
 * quoted TXT strings, and structured MX/SRV/CAA fields. Requires recent Step-Up MFA.
 */
export async function importZoneFileRecords(
  idToken: string,
  orgId: string,
  zoneId: string,
  zoneFileText: string,
  proxyAllImported = false,
  stepUpToken?: string
) {
  if (!zoneId || !zoneFileText?.trim()) {
    return { success: false, error: 'Zone file is empty.' };
  }
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Edit', 'DNS: Admin']);
    assertStepUpMfa(verified.uid, stepUpToken);

    let currentOrigin = (verified.orgData?.cloudflareZoneName || verified.orgData?.domain || '')
      .toLowerCase()
      .replace(/\.$/, '')
      .trim();
    let defaultTtl = 1;
    let lastOwnerName = currentOrigin;

    const unfolded = unfoldBindLines(zoneFileText);
    const posts: any[] = [];
    const diagnostics: Array<{ line: number; status: 'queued' | 'skipped' | 'error'; message: string }> = [];

    for (const { lineNum, text } of unfolded) {
      const tokens = tokenizeBindLine(text);
      if (tokens.length === 0) continue;

      const directive = tokens[0].toUpperCase();
      if (directive === '$ORIGIN' && tokens[1]) {
        currentOrigin = tokens[1].replace(/\.$/, '').trim();
        lastOwnerName = currentOrigin;
        continue;
      }
      if (directive === '$TTL' && tokens[1] && /^\d+$/.test(tokens[1])) {
        const parsed = parseInt(tokens[1], 10);
        defaultTtl = parsed >= 60 ? parsed : 1;
        continue;
      }
      if (directive.startsWith('$')) continue;

      let cursor = 0;
      let ownerToken = tokens[0];
      if (
        ownerToken.toUpperCase() === 'IN' ||
        /^\d+$/.test(ownerToken) ||
        IMPORT_SUPPORTED_TYPES.has(ownerToken.toUpperCase())
      ) {
        ownerToken = lastOwnerName;
      } else {
        ownerToken = expandBindName(ownerToken, currentOrigin);
        lastOwnerName = ownerToken;
        cursor = 1;
      }

      let ttl = defaultTtl;
      while (cursor < tokens.length) {
        const t = tokens[cursor];
        if (/^\d+$/.test(t)) {
          const parsed = parseInt(t, 10);
          ttl = parsed >= 60 ? parsed : 1;
          cursor++;
        } else if (t.toUpperCase() === 'IN' || t.toUpperCase() === 'CH' || t.toUpperCase() === 'HS') {
          cursor++;
        } else {
          break;
        }
      }

      const type = (tokens[cursor] || '').toUpperCase();
      cursor++;
      if (type === 'SOA') {
        diagnostics.push({ line: lineNum, status: 'skipped', message: 'SOA record skipped.' });
        continue;
      }
      if (!IMPORT_SUPPORTED_TYPES.has(type)) {
        diagnostics.push({ line: lineNum, status: 'skipped', message: `Unsupported record type: ${type || 'unknown'}.` });
        continue;
      }

      const rest = tokens.slice(cursor);
      if (rest.length === 0) {
        diagnostics.push({ line: lineNum, status: 'error', message: `Missing content for ${type} record.` });
        continue;
      }

      const payload: any = {
        type,
        name: ownerToken,
        ttl,
        proxied: proxyAllImported && IMPORT_PROXY_TYPES.has(type),
      };

      if (type === 'MX') {
        const prio = parseInt(rest[0], 10);
        if (!isNaN(prio) && rest.length >= 2) {
          payload.priority = prio;
          payload.content = expandBindName(rest[1], currentOrigin);
        } else {
          payload.priority = 10;
          payload.content = expandBindName(rest[0], currentOrigin);
        }
      } else if (type === 'SRV' && rest.length >= 4) {
        payload.data = {
          priority: parseInt(rest[0], 10) || 10,
          weight: parseInt(rest[1], 10) || 0,
          port: parseInt(rest[2], 10) || 0,
          target: expandBindName(rest[3], currentOrigin),
        };
      } else if (type === 'CAA' && rest.length >= 3) {
        payload.data = {
          flags: parseInt(rest[0], 10) || 0,
          tag: rest[1].replace(/^"|"$/g, ''),
          value: rest.slice(2).join(' ').replace(/^"|"$/g, ''),
        };
      } else if (type === 'TXT') {
        // Concatenate adjacent quoted TXT character-strings cleanly
        payload.content = rest
          .map((seg) => (seg.startsWith('"') && seg.endsWith('"') ? seg.slice(1, -1) : seg))
          .join('');
      } else if (type === 'CNAME' || type === 'NS' || type === 'PTR') {
        payload.content = expandBindName(rest[0], currentOrigin);
      } else {
        payload.content = rest.join(' ').replace(/\.$/, '');
      }

      posts.push(payload);
      diagnostics.push({ line: lineNum, status: 'queued', message: `${type} ${ownerToken}` });
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
    const normalizedDomain = domainName.toLowerCase().replace(/\.$/, '').trim();
    const spfInclude = 'include:_spf.mx.revlet.me';

    // Automatically snapshot before auto-configuring email DNS
    try {
      await createZoneSnapshot(idToken, orgId, zoneId, 'Pre-email DNS auto-configuration backup');
    } catch (snapErr) {
      console.warn('[Safety] Snapshot warning prior to email DNS config:', snapErr);
    }

    const recordsRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!recordsRes.success) throw new Error(recordsRes.error);
    const records: any[] = recordsRes.data || [];
    const failures: string[] = [];

    // 1. Preserve existing SPF senders by merging Revlet's include in-place
    const existingSpf = records.find((r: any) => {
      const isRoot = (r.name || '').toLowerCase().replace(/\.$/, '') === normalizedDomain || r.name === '@';
      return isRoot && r.type === 'TXT' && (r.content || '').toLowerCase().includes('v=spf1');
    });

    if (existingSpf) {
      if (!(existingSpf.content || '').toLowerCase().includes(spfInclude)) {
        const clean = String(existingSpf.content || '').trim().replace(/^"|"$/g, '');
        const mechMatch = clean.match(/(\s+[~?-]all|\s+\+?all)\s*$/i);
        const merged = mechMatch
          ? `${clean.slice(0, clean.lastIndexOf(mechMatch[1]))} ${spfInclude}${mechMatch[1]}`.replace(/\s+/g, ' ').trim()
          : `${clean} ${spfInclude} ~all`.replace(/\s+/g, ' ').trim();
        const updRes = await updateDNSRecord(idToken, orgId, zoneId, existingSpf.id, {
          type: 'TXT',
          name: existingSpf.name,
          content: merged,
          ttl: existingSpf.ttl || 'Auto',
          proxied: false,
        });
        if (!updRes.success) failures.push(`SPF update failed: ${updRes.error}`);
      }
    } else {
      const spfCreate = await createDNSRecord(idToken, orgId, zoneId, {
        type: 'TXT',
        name: normalizedDomain,
        content: `v=spf1 ${spfInclude} ~all`,
        ttl: 'Auto',
        proxied: false,
      });
      if (!spfCreate.success) failures.push(`SPF create failed: ${spfCreate.error}`);
    }

    // 2. Ensure Revlet MX exists BEFORE deleting conflicting root MX records
    const hasRevletMx = records.some((r: any) => {
      const isRoot = (r.name || '').toLowerCase().replace(/\.$/, '') === normalizedDomain || r.name === '@';
      return isRoot && r.type === 'MX' && (r.content || '').toLowerCase().replace(/\.$/, '') === 'mx.revlet.me';
    });

    let mxInstalled = hasRevletMx;
    if (!hasRevletMx) {
      const mxCreate = await createDNSRecord(idToken, orgId, zoneId, {
        type: 'MX',
        name: normalizedDomain,
        content: 'mx.revlet.me',
        priority: 10,
        ttl: 'Auto',
        proxied: false,
      });
      if (mxCreate.success) {
        mxInstalled = true;
      } else {
        failures.push(`MX create failed: ${mxCreate.error}`);
      }
    }

    if (mxInstalled) {
      const conflictingMx = records.filter((r: any) => {
        const isRoot = (r.name || '').toLowerCase().replace(/\.$/, '') === normalizedDomain || r.name === '@';
        return isRoot && r.type === 'MX' && (r.content || '').toLowerCase().replace(/\.$/, '') !== 'mx.revlet.me';
      });
      for (const r of conflictingMx) {
        const delRes = await deleteDNSRecord(idToken, orgId, zoneId, r.id);
        if (!delRes.success) failures.push(`Conflicting MX delete failed: ${delRes.error}`);
      }
    }

    if (failures.length > 0) {
      return { success: false, error: failures[0] };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to configure DNS records' };
  }
}
