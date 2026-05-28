
'use server';

/**
 * @fileOverview Network Infrastructure Server Actions
 * Handles API interactions for domain status and edge record management.
 */

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function cfFetch(path: string, options: RequestInit = {}) {
  if (!API_TOKEN) {
    throw new Error('Infrastructure API token is not configured.');
  }

  const response = await fetch(`${CLOUDFLARE_API_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.errors?.[0]?.message || 'Network API error');
  }
  return data;
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
    console.error('Error fetching domain details:', error);
    throw error;
  }
}

export async function checkZoneActivation(zoneId: string) {
  try {
    const data = await cfFetch(`/zones/${zoneId}/activation_check`, { method: 'PUT' });
    return data.success;
  } catch (error: any) {
    console.error('Error initiating connection check:', error);
    throw error;
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
    console.error('Error listing domain settings:', error);
    throw error;
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
    console.error('Error applying domain setting:', error);
    throw error;
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
    console.error('Error updating domain setting:', error);
    throw error;
  }
}

export async function deleteDNSRecord(zoneId: string, recordId: string) {
  try {
    const data = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
    });
    return data.result;
  } catch (error: any) {
    console.error('Error removing domain setting:', error);
    throw error;
  }
}
