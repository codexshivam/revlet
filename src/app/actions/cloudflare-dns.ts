'use server';

/**
 * @fileOverview Network Infrastructure Server Actions
 * Handles authenticated API interactions for domain status, BYOT (Bring Your Own Token),
 * edge record management, and safe-mode DNS snapshots & rollback.
 * Authenticates callers via Firebase ID token and asserts organization tenancy.
 */

import { verifyUserOrgAccess } from './auth-helper';
import { cfFetch } from './cf-fetch';
import { adminDb } from '@/firebase/admin';
import { encryptToken } from '@/lib/security/encryption';
import { FieldValue } from 'firebase-admin/firestore';

export async function getZoneDetails(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);
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
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);
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
      data: allRecords.map((r: any) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        content: r.content,
        ttl: r.ttl === 1 ? 'Auto' : r.ttl.toString(),
        proxied: r.proxied,
        priority: r.priority,
      }))
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to list domain settings' };
  }
}

export async function createDNSRecord(idToken: string, orgId: string, zoneId: string, record: any) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);

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
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);

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
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);
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
    const verified = await verifyUserOrgAccess(idToken, orgId);
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

    // 2. Create the zone
    const zoneData = await cfFetch('/zones', {
      method: 'POST',
      body: JSON.stringify({
        name: domainName,
        account: { id: accountId },
        type: 'full'
      }),
    }, verified.cfToken);

    return { 
      success: true, 
      data: {
        id: zoneData.result.id,
        nameServers: zoneData.result.name_servers
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

    // Step 2: Query accessible zones via GET /zones to audit scope & confirm domain match
    const zonesRes = await cfFetch('/zones', {}, cleanToken);
    const zones: any[] = Array.isArray(zonesRes.result) ? zonesRes.result : [];

    if (zones.length === 0) {
      return {
        success: false,
        error: 'The provided token has no Zone access. Please ensure "Zone: Zone (Read)" and "Zone: DNS (Edit)" permissions are assigned to your zone.'
      };
    }

    // Find the zone matching the organization's root domain
    const matchedZone = zones.find((z: any) => z.name?.toLowerCase().trim() === domain);

    if (!matchedZone) {
      const accessibleNames = zones.map((z: any) => z.name).slice(0, 3).join(', ');
      return {
        success: false,
        error: `Token does not have access to zone "${domain}". Accessible zones on this token: ${accessibleNames || 'none'}. Please ensure your token Zone Resources includes "${domain}".`
      };
    }

    // Step 3: Envelope Encryption using AES-256-GCM
    const encrypted = encryptToken(cleanToken);

    // Step 4: Write-only storage in Firestore
    const orgRef = adminDb.collection('organizations').doc(orgId);
    await orgRef.update({
      cloudflareZoneId: matchedZone.id,
      dnsMode: 'byot',
      cloudflareTokenEncrypted: {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        masked: encrypted.masked,
        verifiedAt: new Date().toISOString(),
        expiresOn,
        zoneId: matchedZone.id,
        zoneName: matchedZone.name,
        zoneStatus: matchedZone.status,
        scopedZoneCount: zones.length
      },
      dnsRequested: true,
      updatedAt: new Date().toISOString()
    });

    // Step 5: Automatically create an initial baseline snapshot
    try {
      const recordsRes = await cfFetch(`/zones/${matchedZone.id}/dns_records?per_page=100`, {}, cleanToken);
      const initialRecords = (recordsRes.result || []).map((r: any) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        content: r.content,
        ttl: r.ttl === 1 ? 'Auto' : r.ttl.toString(),
        proxied: r.proxied,
        priority: r.priority
      }));

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
 * Disconnects the organization's custom Cloudflare token.
 */
export async function disconnectCloudflareToken(idToken: string, orgId: string) {
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId);
    if (!verified.isOwner) {
      return { success: false, error: 'Only organization owners can disconnect an edge token.' };
    }

    await adminDb.collection('organizations').doc(orgId).update({
      cloudflareTokenEncrypted: FieldValue.delete(),
      cloudflareZoneId: FieldValue.delete(),
      dnsMode: FieldValue.delete(),
      dnsRequested: FieldValue.delete(),
      updatedAt: new Date().toISOString()
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to disconnect token.' };
  }
}

/**
 * Returns the non-sensitive token audit metadata for the verified badge.
 */
export async function getCloudflareTokenAudit(idToken: string, orgId: string) {
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId);
    const tokenMeta = verified.orgData?.cloudflareTokenEncrypted;
    if (!tokenMeta || !tokenMeta.ciphertext) {
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
 * Creates an exportable JSON snapshot of the current zone records.
 */
export async function createZoneSnapshot(idToken: string, orgId: string, zoneId: string, reason: string = 'Manual snapshot') {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);
    const recordsRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!recordsRes.success || !recordsRes.data) throw new Error(recordsRes.error || 'Failed to fetch DNS records');

    const records = recordsRes.data;
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
    await verifyUserOrgAccess(idToken, orgId);
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

/**
 * 1-Click Rollback: Reconciles live zone records against a selected snapshot.
 */
export async function rollbackZoneSnapshot(idToken: string, orgId: string, zoneId: string, snapshotId: string) {
  if (!zoneId || !snapshotId) return { success: false, error: 'Missing parameters' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);
    
    // 1. Fetch snapshot
    const snapDoc = await adminDb.collection('organizations').doc(orgId).collection('dns_snapshots').doc(snapshotId).get();
    if (!snapDoc.exists) {
      return { success: false, error: 'Snapshot not found' };
    }
    const snapData = snapDoc.data();
    const targetRecords: any[] = snapData?.records || [];

    // 2. Fetch current live records
    const currentRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!currentRes.success) throw new Error(currentRes.error);
    const currentRecords: any[] = currentRes.data || [];

    // 3. Pre-rollback safety backup of current state
    await adminDb.collection('organizations').doc(orgId).collection('dns_snapshots').add({
      createdAt: new Date().toISOString(),
      reason: `Pre-rollback backup before restoring snapshot (${snapData?.reason || snapshotId.slice(0, 6)})`,
      recordCount: currentRecords.length,
      records: currentRecords,
      createdById: verified.uid
    });

    // 4. Perform diff & rollback
    // Step A: Delete records present currently that are NOT in target snapshot
    let deletedCount = 0;
    for (const cur of currentRecords) {
      const matchInTarget = targetRecords.find(t => 
        t.type === cur.type && 
        t.name === cur.name && 
        t.content === cur.content
      );
      if (!matchInTarget) {
        await deleteDNSRecord(idToken, orgId, zoneId, cur.id);
        deletedCount++;
      }
    }

    // Step B: Recreate missing records from snapshot
    let restoredCount = 0;
    const afterDeleteRes = await listDNSRecords(idToken, orgId, zoneId);
    const remainingRecords: any[] = afterDeleteRes.data || [];

    for (const target of targetRecords) {
      const exists = remainingRecords.some(r => 
        r.type === target.type && 
        r.name === target.name && 
        r.content === target.content
      );
      if (!exists) {
        await createDNSRecord(idToken, orgId, zoneId, {
          type: target.type,
          name: target.name,
          content: target.content,
          ttl: target.ttl,
          proxied: target.proxied,
          priority: target.priority
        });
        restoredCount++;
      }
    }

    return {
      success: true,
      data: {
        restoredCount,
        deletedCount,
        snapshotReason: snapData?.reason,
        snapshotDate: snapData?.createdAt
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Rollback failed.' };
  }
}

/**
 * Pre-Flight Diff Preview: Shows exactly what records will be modified/added/deleted
 * before executing the automated Email Routing setup.
 */
export async function previewEmailRoutingDNSDiff(idToken: string, orgId: string, zoneId: string, domainName: string) {
  if (!zoneId || !domainName) return { success: false, error: 'Missing parameters' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const recordsRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!recordsRes.success) throw new Error(recordsRes.error);
    const currentRecords: any[] = recordsRes.data || [];

    // Conflicting records that will be removed
    const toDelete = currentRecords.filter((r: any) => {
      const isRoot = r.name === domainName || r.name === `@`;
      if (!isRoot) return false;
      if (r.type === 'MX') return true;
      if (r.type === 'TXT' && r.content.includes('v=spf1')) return true;
      return false;
    });

    // Required records to be added
    const toAdd = [
      { type: 'MX', name: domainName, content: 'route1.mx.cloudflare.net', priority: 17, ttl: 'Auto', proxied: false },
      { type: 'MX', name: domainName, content: 'route2.mx.cloudflare.net', priority: 54, ttl: 'Auto', proxied: false },
      { type: 'MX', name: domainName, content: 'route3.mx.cloudflare.net', priority: 72, ttl: 'Auto', proxied: false },
      { type: 'TXT', name: domainName, content: 'v=spf1 include:_spf.mx.cloudflare.net ~all', ttl: 'Auto', proxied: false }
    ];

    // Non-conflicting records that are kept untouched
    const untouched = currentRecords.filter((r: any) => !toDelete.some(d => d.id === r.id));

    return {
      success: true,
      data: {
        toDelete,
        toAdd,
        untouchedCount: untouched.length,
        domainName
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to generate diff preview' };
  }
}

// --- Email Routing Automation ---

export async function enableEmailRouting(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/email/routing/enable`, {
      method: 'POST',
      body: JSON.stringify({})
    }, verified.cfToken);
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to enable email routing' };
  }
}

export async function disableEmailRouting(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/email/routing/disable`, {
      method: 'POST',
      body: JSON.stringify({})
    }, verified.cfToken);
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to disable email routing' };
  }
}

export async function getEmailRoutingStatus(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/email/routing`, {}, verified.cfToken);
    return { success: true, data: data.result };
  } catch (error: any) {
    if (error.status === 404 || (error.message && error.message.includes("not found"))) {
      return { success: true, data: { status: "unconfigured" } };
    }
    return { success: false, error: error.message || 'Failed to get email routing status' };
  }
}

export async function autoConfigureEmailDNS(idToken: string, orgId: string, zoneId: string, domainName: string) {
  if (!zoneId || !domainName) return { success: false, error: 'Missing parameters' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);
    
    // Automatically snapshot before auto-configuring email DNS
    try {
      await createZoneSnapshot(idToken, orgId, zoneId, 'Pre-email routing auto-configuration backup');
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

    // Create required records
    const requiredRecords = [
      { type: 'MX', name: domainName, content: 'route1.mx.cloudflare.net', priority: 17, ttl: 'Auto', proxied: false },
      { type: 'MX', name: domainName, content: 'route2.mx.cloudflare.net', priority: 54, ttl: 'Auto', proxied: false },
      { type: 'MX', name: domainName, content: 'route3.mx.cloudflare.net', priority: 72, ttl: 'Auto', proxied: false },
      { type: 'TXT', name: domainName, content: 'v=spf1 include:_spf.mx.cloudflare.net ~all', ttl: 'Auto', proxied: false }
    ];

    for (const rec of requiredRecords) {
      await createDNSRecord(idToken, orgId, zoneId, rec);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to configure DNS records' };
  }
}

export async function removeEmailRoutingDNS(idToken: string, orgId: string, zoneId: string, domainName: string) {
  if (!zoneId || !domainName) return { success: false, error: 'Missing parameters' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId);
    const recordsRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!recordsRes.success) throw new Error(recordsRes.error);
    
    const cfRecords = (recordsRes.data || []).filter((r: any) => {
      const isRoot = r.name === domainName || r.name === `@`;
      if (!isRoot) return false;
      if (r.type === 'MX' && r.content.includes('.mx.cloudflare.net')) return true;
      if (r.type === 'TXT' && r.content === 'v=spf1 include:_spf.mx.cloudflare.net ~all') return true;
      return false;
    });

    for (const r of cfRecords) {
      await deleteDNSRecord(idToken, orgId, zoneId, r.id);
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to remove DNS records' };
  }
}
