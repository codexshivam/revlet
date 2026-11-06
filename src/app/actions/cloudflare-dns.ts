'use server';

/**
 * @fileOverview Network Infrastructure Server Actions
 * Handles authenticated API interactions for domain status and edge record management.
 * Authenticates callers via Firebase ID token and verifies organization tenancy.
 */

import { verifyUserOrgAccess } from './auth-helper';

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

async function cfFetch(path: string, options: RequestInit = {}) {
  const dnsToken = process.env.CLOUDFLARE_DNS_TOKEN;

  const resolvedHeaders: Record<string, string> = {};

  if (options.body) {
    resolvedHeaders['Content-Type'] = 'application/json';
  }

  // High-fidelity sanitation: strip outer spaces and literal single/double quotes loaded from env
  const cleanToken = dnsToken?.trim().replace(/^["']|["']$/g, '');

  if (cleanToken) {
    resolvedHeaders['Authorization'] = `Bearer ${cleanToken}`;
  } else {
    console.error(`[Infrastructure Action] Missing CLOUDFLARE_DNS_TOKEN in environment variables.`);
    throw new Error("Authentication failed. Please configure CLOUDFLARE_DNS_TOKEN in your environment variables.");
  }

  try {
    const response = await fetch(`${CLOUDFLARE_API_URL}${path}`, {
      ...options,
      headers: {
        ...resolvedHeaders,
        ...options.headers,
      },
      cache: 'no-store',
    });

    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error(`[Infrastructure Action] Expected JSON from Cloudflare but received: ${text.substring(0, 100)}`);
      throw new Error(`Cloudflare API returned an unexpected format (${response.status}).`);
    }

    if (!response.ok) {
      const message = data.errors?.[0]?.message || data.message || `Cloudflare API error (${response.status})`;
      const err = new Error(message);
      (err as any).status = response.status;
      throw err;
    }
    
    return data;
  } catch (error: any) {
    console.error(`Infrastructure API failure [${path}]:`, error.message);
    
    // User-friendly network edge error translation
    let friendlyMessage = error.message || "An unexpected error occurred.";
    if (friendlyMessage.includes("fetch failed") || friendlyMessage.includes("ENOTFOUND")) {
      friendlyMessage = "Connection failed. Failed to reach the Cloudflare network edge. Please check your internet connection.";
    } else if (error.status === 403 || error.status === 401 || friendlyMessage.includes("Unauthorized") || friendlyMessage.toLowerCase().includes("token")) {
      if (path.startsWith('/zones/') && path.split('/').length >= 3) {
        friendlyMessage = `Zone Access Denied (403). The domain may have been deleted from Cloudflare.`;
      } else {
        friendlyMessage = "Authentication failed. The configured Cloudflare API token is invalid or has insufficient permissions.";
      }
    } else if (error.status === 404 || friendlyMessage.includes("not found")) {
      friendlyMessage = `Resource not found (404).`;
    } else if (error.status === 429 || friendlyMessage.includes("Too Many Requests")) {
      friendlyMessage = "Request rate limit reached at the edge. Please wait a moment before trying again.";
    }
    
    throw new Error(friendlyMessage);
  }
}

export async function getZoneDetails(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}`);
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
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/dns_records?per_page=100`);
    return {
      success: true,
      data: data.result.map((r: any) => ({
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
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl === 'Auto' ? 1 : parseInt(record.ttl),
        proxied: record.proxied,
        priority: record.priority,
      }),
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to apply domain setting' };
  }
}

export async function updateDNSRecord(idToken: string, orgId: string, zoneId: string, recordId: string, record: any) {
  if (!zoneId || !recordId) return { success: false, error: 'Missing Zone ID or Record ID' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl === 'Auto' ? 1 : parseInt(record.ttl),
        proxied: record.proxied,
        priority: record.priority,
      }),
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update domain setting' };
  }
}

export async function deleteDNSRecord(idToken: string, orgId: string, zoneId: string, recordId: string) {
  if (!zoneId || !recordId) return { success: false, error: 'Missing Zone ID or Record ID' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
    });
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

    // 1. Fetch accounts to get the Account ID
    const accountsData = await cfFetch('/accounts');
    const accountId = accountsData.result?.[0]?.id;
    
    if (!accountId) {
      throw new Error("No Cloudflare account found. Ensure your token has Account level permissions.");
    }

    // 2. Create the zone
    const zoneData = await cfFetch('/zones', {
      method: 'POST',
      body: JSON.stringify({
        name: domainName,
        account: { id: accountId },
        type: 'full'
      }),
    });

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

// --- Email Routing Automation ---

export async function enableEmailRouting(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/email/routing/enable`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to enable email routing' };
  }
}

export async function disableEmailRouting(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/email/routing/disable`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to disable email routing' };
  }
}

export async function getEmailRoutingStatus(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/email/routing`);
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
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const recordsRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!recordsRes.success) throw new Error(recordsRes.error);
    const records = recordsRes.data;

    // Delete conflicting records
    const conflictingRecords = records.filter((r: any) => {
      const isRoot = r.name === domainName;
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
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const recordsRes = await listDNSRecords(idToken, orgId, zoneId);
    if (!recordsRes.success) throw new Error(recordsRes.error);
    
    const cfRecords = recordsRes.data.filter((r: any) => {
      const isRoot = r.name === domainName;
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
