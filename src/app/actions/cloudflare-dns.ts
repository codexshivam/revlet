'use server';

/**
 * @fileOverview Network Infrastructure Server Actions
 * Handles API interactions for domain status and edge record management.
 */

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

async function cfFetch(path: string, options: RequestInit = {}) {
  const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
  
  if (!API_TOKEN) {
    throw new Error('Infrastructure API token is not configured. Please add CLOUDFLARE_API_TOKEN to your environment variables.');
  }

  try {
    const response = await fetch(`${CLOUDFLARE_API_URL}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid response from infrastructure API: ${text.substring(0, 100)}`);
    }

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

export async function createZone(domain: string) {
  try {
    const data = await cfFetch('/zones', {
      method: 'POST',
      body: JSON.stringify({
        name: domain,
        type: 'full'
      }),
    });
    return data.result;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to initialize domain infrastructure');
  }
}

export async function getZoneDetails(zoneId: string) {
  try {
    const data = await cfFetch(`/zones/${zoneId}`);
    return {
      status: data.result.status,
      nameServers: data.result.name_servers,
      originalNameServers: data.result.original_name_servers,
      paused: data.result.paused,
      type: data.result.type,
    };
  } catch (error: any) {
    throw new Error(error.message || 'Failed to fetch domain details');
  }
}

export async function checkZoneActivation(zoneId: string) {
  try {
    const data = await cfFetch(`/zones/${zoneId}/activation_check`, { method: 'PUT' });
    return data.success;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to initiate connection check');
  }
}

export async function listDNSRecords(zoneId: string) {
  try {
    const data = await cfFetch(`/zones/${zoneId}/dns_records?per_page=100`);
    return data.result.map((r: any) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      content: r.content,
      ttl: r.ttl === 1 ? 'Auto' : r.ttl.toString(),
      proxied: r.proxied,
      priority: r.priority,
    }));
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list domain settings');
  }
}

export async function createDNSRecord(zoneId: string, record: any) {
  try {
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
    return data.result;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to apply domain setting');
  }
}

export async function updateDNSRecord(zoneId: string, recordId: string, record: any) {
  try {
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
    return data.result;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to update domain setting');
  }
}

export async function deleteDNSRecord(zoneId: string, recordId: string) {
  try {
    const data = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
    });
    return data.result;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to remove domain setting');
  }
}