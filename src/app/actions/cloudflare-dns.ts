
'use server';

/**
 * @fileOverview Network Infrastructure Server Actions
 * Handles API interactions for domain status and edge record management.
 * Uses dual-token security: DNS Token for CRUD, Infra Token for Status.
 */

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

async function cfFetch(path: string, tokenType: 'DNS' | 'INFRA', options: RequestInit = {}) {
  const API_TOKEN = tokenType === 'DNS' 
    ? process.env.CLOUDFLARE_DNS_TOKEN 
    : process.env.CLOUDFLARE_INFRA_TOKEN;
  
  if (!API_TOKEN) {
    throw new Error(`Cloudflare ${tokenType} token is not configured in environment variables.`);
  }

  try {
    const response = await fetch(`${CLOUDFLARE_API_URL}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data.errors?.[0]?.message || data.message || `API error (${response.status})`;
      throw new Error(message);
    }
    
    return data;
  } catch (error: any) {
    console.error(`Infrastructure API failure [${path}]:`, error.message);
    throw error;
  }
}

export async function getZoneDetails(zoneId: string) {
  try {
    const data = await cfFetch(`/zones/${zoneId}`, 'INFRA');
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

export async function checkZoneActivation(zoneId: string) {
  try {
    const data = await cfFetch(`/zones/${zoneId}/activation_check`, 'INFRA', { method: 'PUT' });
    return { success: true, data: data.success };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to initiate connection check' };
  }
}

export async function listDNSRecords(zoneId: string) {
  try {
    const data = await cfFetch(`/zones/${zoneId}/dns_records?per_page=100`, 'DNS');
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

export async function createDNSRecord(zoneId: string, record: any) {
  try {
    const data = await cfFetch(`/zones/${zoneId}/dns_records`, 'DNS', {
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

export async function updateDNSRecord(zoneId: string, recordId: string, record: any) {
  try {
    const data = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, 'DNS', {
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

export async function deleteDNSRecord(zoneId: string, recordId: string) {
  try {
    const data = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, 'DNS', {
      method: 'DELETE',
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to remove domain setting' };
  }
}
