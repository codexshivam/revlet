'use server';

/**
 * @fileOverview Network Infrastructure Server Actions
 * Handles authenticated API interactions for domain status, BYOT (Bring Your Own Token),
 * edge record management, and safe-mode DNS snapshots & rollback.
 * Authenticates callers via Firebase ID token and asserts organization tenancy.
 */

import { verifyUserOrgAccess } from './auth-helper';
import { cfFetch } from './dns-client';
import { adminDb } from '@/firebase/admin';
import { encryptToken } from '@/lib/security/encryption';
import { FieldValue } from 'firebase-admin/firestore';
import {
  resolveOrganizationOwnerEmail,
  sendRevletAlertEmail,
} from '@/lib/revlet-alerts';

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

    // Fetch record metadata prior to deletion to detect critical mail/root records
    let deletedRecord: { type?: string; name?: string; content?: string } | null = null;
    try {
      const existing = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'GET' }, verified.cfToken);
      deletedRecord = existing?.result || null;
    } catch {
      // Proceed with deletion even if pre-fetch fails
    }

    const data = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
    }, verified.cfToken);

    if (deletedRecord) {
      const recType = String(deletedRecord.type || '').toUpperCase();
      const recName = String(deletedRecord.name || '').toLowerCase();
      const recContent = String(deletedRecord.content || '').toLowerCase();
      const orgDomain = String(verified.orgData?.domain || '').toLowerCase().trim();

      const isCriticalMail =
        recType === 'MX' ||
        (recType === 'TXT' &&
          (recContent.includes('v=spf1') || recName.includes('_dmarc') || recName.includes('_domainkey'))) ||
        (recType === 'CNAME' && recName.includes('_domainkey'));
      const isRootHost =
        Boolean(orgDomain) &&
        (recType === 'A' || recType === 'AAAA' || recType === 'CNAME') &&
        recName === orgDomain;

      if (isCriticalMail || isRootHost) {
        try {
          const ownerEmail =
            (await resolveOrganizationOwnerEmail(verified.orgData || {})) ||
            (verified.email ? verified.email.toLowerCase().trim() : null);
          if (ownerEmail) {
            await sendRevletAlertEmail({
              to: ownerEmail,
              subject: `[Revlet Warning] Critical ${recType} DNS Record Removed (${orgDomain || recName})`,
              title: 'Critical DNS Record Removed',
              subtitle: 'DNS Security & Deliverability Warning',
              summaryLines: [
                `A critical ${recType} record was removed from your domain DNS zone. Removing mail or root records can disrupt email delivery or website availability.`,
                'If this was unintended, you can restore a previous zone snapshot from DNS Management.',
              ],
              details: [
                { label: 'Domain', value: orgDomain || recName },
                { label: 'Record Type', value: recType },
                { label: 'Host', value: deletedRecord.name || '@' },
                { label: 'Removed Value', value: String(deletedRecord.content || '').slice(0, 120) },
                { label: 'Removed By', value: verified.email || 'Authorized User' },
              ],
              ctaUrl: 'https://app.revlet.me/services/dns',
              ctaLabel: 'Review DNS Records',
            });
          }
        } catch {
          // Non-blocking warning email
        }
      }
    }

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
    try {
      const existingRes = await cfFetch(`/zones?name=${encodeURIComponent(cleanDomain)}`, {}, verified.cfToken);
      const existingZone = Array.isArray(existingRes.result)
        ? existingRes.result.find((z: any) => z.name?.toLowerCase().trim() === cleanDomain)
        : null;
      if (existingZone) {
        return {
          success: true,
          data: {
            id: existingZone.id,
            nameServers: existingZone.name_servers || [],
          },
        };
      }
    } catch {
      // Proceed to zone creation if lookup fails
    }

    // 3. Create the zone
    const zoneData = await cfFetch('/zones', {
      method: 'POST',
      body: JSON.stringify({
        name: cleanDomain,
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
      dnsMode: 'byot',
      cloudflareTokenAudit: tokenAuditMeta,
      cloudflareTokenEncrypted: FieldValue.delete(),
      dnsRequested: true,
      updatedAt: verifiedAt
    });

    // Step 5: Automatically create an initial baseline snapshot
    try {
      const recordsRes = await cfFetch(`/zones/${matchedZone.id}/dns_records?per_page=100`, {}, cleanToken);
      const initialRecords = sanitizeDNSRecordsForFirestore(recordsRes.result || []);

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
 * Disables DNS management for the organization and completely removes all snapshots
 * and associated DNS/token metadata from Firestore.
 */
export async function disconnectCloudflareToken(idToken: string, orgId: string) {
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId);
    if (!verified.isOwner) {
      return { success: false, error: 'Only organization owners can disable DNS management.' };
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);

    // 1. Delete all DNS snapshots in subcollection
    const snapCol = orgRef.collection('dns_snapshots');
    while (true) {
      const batchSnap = await snapCol.limit(400).get();
      if (batchSnap.empty) break;
      const batch = adminDb.batch();
      batchSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (batchSnap.size < 400) break;
    }

    // 2. Remove all DNS & token fields from the organization document and secrets subcollection
    await orgRef.collection('secrets').doc('cloudflare').delete().catch(() => null);
    await orgRef.update({
      cloudflareTokenEncrypted: FieldValue.delete(),
      cloudflareTokenAudit: FieldValue.delete(),
      cloudflareZoneId: FieldValue.delete(),
      cloudflareTokenVerifiedAt: FieldValue.delete(),
      cloudflareTokenExpiresOn: FieldValue.delete(),
      cloudflareTokenScopedZone: FieldValue.delete(),
      dnsMode: FieldValue.delete(),
      dnsRequested: FieldValue.delete(),
      nameservers: FieldValue.delete(),
      dnsSnapshots: FieldValue.delete(),
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

/**
 * 1-Click Rollback: Reconciles live zone records against a selected snapshot.
 */
export async function rollbackZoneSnapshot(idToken: string, orgId: string, zoneId: string, snapshotId: string) {
  if (!zoneId || !snapshotId) return { success: false, error: 'Missing parameters' };
  try {
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Admin']);
    
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

    // 3. Pre-rollback safety backup of current state (only after DNS: Admin permission check passed)
    const cleanCurrentRecords = sanitizeDNSRecordsForFirestore(currentRecords);
    await adminDb.collection('organizations').doc(orgId).collection('dns_snapshots').add({
      createdAt: new Date().toISOString(),
      reason: `Pre-rollback backup before restoring snapshot (${snapData?.reason || snapshotId.slice(0, 6)})`,
      recordCount: cleanCurrentRecords.length,
      records: cleanCurrentRecords,
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
        const delRes = await deleteDNSRecord(idToken, orgId, zoneId, cur.id);
        if (!delRes.success) {
          throw new Error(delRes.error || `Failed to delete DNS record ${cur.name} (${cur.type}) during rollback.`);
        }
        deletedCount++;
      }
    }

    // Step B: Recreate missing records from snapshot
    let restoredCount = 0;
    const afterDeleteRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!afterDeleteRes.success) {
      throw new Error(afterDeleteRes.error || 'Failed to verify remaining DNS records during rollback.');
    }
    const remainingRecords: any[] = afterDeleteRes.data || [];

    for (const target of targetRecords) {
      const exists = remainingRecords.some(r => 
        r.type === target.type && 
        r.name === target.name && 
        r.content === target.content
      );
      if (!exists) {
        const createRes = await createDNSRecord(idToken, orgId, zoneId, {
          type: target.type,
          name: target.name,
          content: target.content,
          ttl: target.ttl,
          proxied: target.proxied,
          priority: target.priority
        });
        if (!createRes.success) {
          throw new Error(createRes.error || `Failed to restore DNS record ${target.name} (${target.type}) during rollback.`);
        }
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
    await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Read', 'DNS: Edit', 'DNS: Admin']);
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
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Admin']);
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
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Admin']);
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
    const verified = await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Read', 'DNS: Edit', 'DNS: Admin']);
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
    await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Admin']);
    
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

    // Create required records for Revlet Mail Server + AWS SES Outbound
    const requiredRecords = [
      { type: 'MX', name: domainName, content: 'mx.revlet.me', priority: 10, ttl: 'Auto', proxied: false },
      { type: 'TXT', name: domainName, content: 'v=spf1 include:_spf.mx.revlet.me include:amazonses.com ~all', ttl: 'Auto', proxied: false }
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
    await verifyUserOrgAccess(idToken, orgId, zoneId, ['DNS: Admin']);
    const recordsRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!recordsRes.success) throw new Error(recordsRes.error);
    
    const cfRecords = (recordsRes.data || []).filter((r: any) => {
      const isRoot = r.name === domainName || r.name === `@`;
      if (!isRoot) return false;
      const cleanContent = String(r.content || '').toLowerCase().trim();
      if (r.type === 'MX' && /^[a-z0-9-]+\.mx\.cloudflare\.net$/i.test(cleanContent)) return true;
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
