'use server';

/**
 * @fileOverview Cloudflare Infrastructure & Edge Platform Server Actions
 * Handles edge operations: Cache Purge, SSL/TLS, Speed & Minification, DDoS Mitigation,
 * Free Email Routing, and 1-Click Platform DNS Presets.
 */

import { verifyUserOrgAccess } from './auth-helper';
import { cfFetch } from './cf-fetch';
import { createDNSRecord, listDNSRecords, deleteDNSRecord } from './cloudflare-dns';

// --- 1. SPEED & CACHE ---

export async function purgeZoneCache(
  idToken: string,
  orgId: string,
  zoneId: string,
  purgeEverything: boolean = true
) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      body: JSON.stringify({ purge_everything: purgeEverything }),
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to purge edge cache' };
  }
}

export async function getZoneDevelopmentMode(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/settings/development_mode`);
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch development mode' };
  }
}

export async function setZoneDevelopmentMode(
  idToken: string,
  orgId: string,
  zoneId: string,
  value: 'on' | 'off'
) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/settings/development_mode`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update development mode' };
  }
}

export async function getZoneSpeedSettings(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const [brotliRes, earlyHintsRes, minifyRes] = await Promise.allSettled([
      cfFetch(`/zones/${zoneId}/settings/brotli`),
      cfFetch(`/zones/${zoneId}/settings/early_hints`),
      cfFetch(`/zones/${zoneId}/settings/minify`),
    ]);

    return {
      success: true,
      data: {
        brotli: brotliRes.status === 'fulfilled' ? brotliRes.value?.result?.value : 'on',
        earlyHints: earlyHintsRes.status === 'fulfilled' ? earlyHintsRes.value?.result?.value : 'off',
        minify: minifyRes.status === 'fulfilled' ? minifyRes.value?.result?.value : { css: 'off', html: 'off', js: 'off' },
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch speed settings' };
  }
}

export async function updateZoneSpeedSetting(
  idToken: string,
  orgId: string,
  zoneId: string,
  setting: 'brotli' | 'early_hints',
  value: 'on' | 'off'
) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/settings/${setting}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || `Failed to update ${setting}` };
  }
}

export async function updateZoneMinify(
  idToken: string,
  orgId: string,
  zoneId: string,
  value: { css: 'on' | 'off'; html: 'on' | 'off'; js: 'on' | 'off' }
) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/settings/minify`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update minification' };
  }
}

// --- 2. SSL & SECURITY ---

export async function getZoneSSLSettings(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const [sslRes, httpsRes, rewritesRes, minTlsRes] = await Promise.allSettled([
      cfFetch(`/zones/${zoneId}/settings/ssl`),
      cfFetch(`/zones/${zoneId}/settings/always_use_https`),
      cfFetch(`/zones/${zoneId}/settings/automatic_https_rewrites`),
      cfFetch(`/zones/${zoneId}/settings/min_tls_version`),
    ]);

    return {
      success: true,
      data: {
        ssl: sslRes.status === 'fulfilled' ? sslRes.value?.result?.value : 'full',
        alwaysUseHttps: httpsRes.status === 'fulfilled' ? httpsRes.value?.result?.value : 'on',
        autoHttpsRewrites: rewritesRes.status === 'fulfilled' ? rewritesRes.value?.result?.value : 'on',
        minTlsVersion: minTlsRes.status === 'fulfilled' ? minTlsRes.value?.result?.value : '1.2',
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch SSL settings' };
  }
}

export async function setZoneSSLSetting(
  idToken: string,
  orgId: string,
  zoneId: string,
  setting: 'ssl' | 'always_use_https' | 'automatic_https_rewrites' | 'min_tls_version',
  value: string
) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/settings/${setting}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || `Failed to update ${setting}` };
  }
}

export async function getZoneDNSSEC(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/dnssec`);
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch DNSSEC status' };
  }
}

export async function setZoneDNSSEC(
  idToken: string,
  orgId: string,
  zoneId: string,
  status: 'active' | 'disabled'
) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/dnssec`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update DNSSEC' };
  }
}

// --- 3. DDOS & PROTECTION ---

export async function getZoneSecurityLevel(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/settings/security_level`);
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch security level' };
  }
}

export async function setZoneSecurityLevel(
  idToken: string,
  orgId: string,
  zoneId: string,
  value: 'essentially_off' | 'low' | 'medium' | 'high' | 'under_attack'
) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/settings/security_level`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update security level' };
  }
}

// --- 4. FREE EMAIL ROUTING RULES ---

export async function getEmailRoutingRules(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/email/routing/rules?per_page=50`);
    return {
      success: true,
      data: (data.result || []).map((r: any) => ({
        id: r.tag || r.id,
        name: r.name,
        enabled: r.enabled,
        matcher: r.matchers?.[0]?.value || 'Catch-all',
        destination: r.actions?.[0]?.value?.[0] || 'Unknown',
        type: r.matchers?.[0]?.type || 'all',
      })),
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to list email routing rules' };
  }
}

export async function createEmailRoutingRule(
  idToken: string,
  orgId: string,
  zoneId: string,
  alias: string,
  destinationEmail: string,
  isCatchAll: boolean = false
) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);

    const payload = isCatchAll
      ? {
          matchers: [{ type: 'all' }],
          actions: [{ type: 'forward', value: [destinationEmail.trim()] }],
          name: `Catch-all forward to ${destinationEmail.trim()}`,
          enabled: true,
        }
      : {
          matchers: [{ type: 'literal', field: 'to', value: alias.trim() }],
          actions: [{ type: 'forward', value: [destinationEmail.trim()] }],
          name: `Forward ${alias.trim()} to ${destinationEmail.trim()}`,
          enabled: true,
        };

    const data = await cfFetch(`/zones/${zoneId}/email/routing/rules`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create email routing rule' };
  }
}

export async function deleteEmailRoutingRule(
  idToken: string,
  orgId: string,
  zoneId: string,
  ruleId: string
) {
  if (!zoneId || !ruleId) return { success: false, error: 'Missing parameters' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    const data = await cfFetch(`/zones/${zoneId}/email/routing/rules/${ruleId}`, {
      method: 'DELETE',
    });
    return { success: true, data: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete email routing rule' };
  }
}

// --- 5. 1-CLICK PLATFORM CONNECTORS ---

export type PlatformPreset = 'vercel' | 'supabase' | 'resend' | 'render' | 'railway' | 'github';

export async function applyPlatformPreset(
  idToken: string,
  orgId: string,
  zoneId: string,
  domainName: string,
  platform: PlatformPreset,
  extraConfig?: { customSubdomain?: string; customTarget?: string }
) {
  if (!zoneId || !domainName) return { success: false, error: 'Missing zone or domain' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);

    const recordsToAdd: Array<{
      type: string;
      name: string;
      content: string;
      ttl: string | number;
      proxied: boolean;
      priority?: number;
    }> = [];

    switch (platform) {
      case 'vercel':
        // Vercel standard: Apex A record 76.76.21.21 (DNS only or proxied) and CNAME www
        recordsToAdd.push({
          type: 'A',
          name: domainName,
          content: '76.76.21.21',
          ttl: 'Auto',
          proxied: false,
        });
        recordsToAdd.push({
          type: 'CNAME',
          name: `www.${domainName}`,
          content: 'cname.vercel-dns.com',
          ttl: 'Auto',
          proxied: false,
        });
        break;

      case 'supabase':
        // Supabase custom domain CNAME
        const sub = extraConfig?.customSubdomain || 'api';
        const target = extraConfig?.customTarget || 'custom.supabase.co';
        recordsToAdd.push({
          type: 'CNAME',
          name: `${sub}.${domainName}`,
          content: target,
          ttl: 'Auto',
          proxied: false,
        });
        break;

      case 'resend':
        // Resend email sending: SPF, DKIM, and MX
        recordsToAdd.push({
          type: 'TXT',
          name: domainName,
          content: 'v=spf1 include:amazonses.com ~all',
          ttl: 'Auto',
          proxied: false,
        });
        recordsToAdd.push({
          type: 'MX',
          name: `send.${domainName}`,
          content: 'feedback-smtp.us-east-1.amazonses.com',
          ttl: 'Auto',
          proxied: false,
          priority: 10,
        });
        recordsToAdd.push({
          type: 'TXT',
          name: `send.${domainName}`,
          content: 'v=spf1 include:amazonses.com ~all',
          ttl: 'Auto',
          proxied: false,
        });
        break;

      case 'render':
        recordsToAdd.push({
          type: 'A',
          name: domainName,
          content: '216.24.57.1',
          ttl: 'Auto',
          proxied: false,
        });
        recordsToAdd.push({
          type: 'CNAME',
          name: `www.${domainName}`,
          content: extraConfig?.customTarget || `${domainName}.onrender.com`,
          ttl: 'Auto',
          proxied: false,
        });
        break;

      case 'railway':
        recordsToAdd.push({
          type: 'CNAME',
          name: extraConfig?.customSubdomain ? `${extraConfig.customSubdomain}.${domainName}` : domainName,
          content: extraConfig?.customTarget || `${domainName}.up.railway.app`,
          ttl: 'Auto',
          proxied: false,
        });
        break;

      case 'github':
        const githubIPs = [
          '185.199.108.153',
          '185.199.109.153',
          '185.199.110.153',
          '185.199.111.153',
        ];
        for (const ip of githubIPs) {
          recordsToAdd.push({
            type: 'A',
            name: domainName,
            content: ip,
            ttl: 'Auto',
            proxied: false,
          });
        }
        recordsToAdd.push({
          type: 'CNAME',
          name: `www.${domainName}`,
          content: extraConfig?.customTarget || `${domainName}.github.io`,
          ttl: 'Auto',
          proxied: false,
        });
        break;
    }

    const createdRecords = [];
    for (const rec of recordsToAdd) {
      const res = await createDNSRecord(idToken, orgId, zoneId, rec);
      if (res.success) {
        createdRecords.push(res.data);
      }
    }

    return {
      success: true,
      data: {
        platform,
        recordsCreated: createdRecords.length,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || `Failed to apply ${platform} preset` };
  }
}
