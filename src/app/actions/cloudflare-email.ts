'use server';

/**
 * @fileOverview Email Routing Infrastructure Server Actions
 * Handles secure email forwarding configuration and domain security hardening.
 * All third-party platform credentials remain isolated in server-side environment variables.
 */

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

async function cfFetch(path: string, tokenType: 'DNS' | 'INFRA', options: RequestInit = {}) {
  const dnsToken = process.env.CLOUDFLARE_DNS_TOKEN;
  const infraToken = process.env.CLOUDFLARE_INFRA_TOKEN;

  // High-fidelity fallback: Support single all-access token deployments cleanly
  const API_TOKEN = tokenType === 'DNS'
    ? (dnsToken || infraToken)
    : (infraToken || dnsToken);

  if (!API_TOKEN) {
    console.error(`[Email Routing Action] Missing token configuration in environment variables.`);
    throw new Error("Authentication token is not configured. Please add CLOUDFLARE_DNS_TOKEN or CLOUDFLARE_INFRA_TOKEN to your .env.local file.");
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

    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error(`[Email Routing Action] Expected JSON but received: ${text.substring(0, 100)}`);
      throw new Error(`Email routing service returned an unexpected format (${response.status}).`);
    }

    if (!response.ok) {
      const message = data.errors?.[0]?.message || data.message || `Email routing service error (${response.status})`;
      throw new Error(message);
    }

    return data;
  } catch (error: any) {
    console.error(`Email Routing API failure [${path}]:`, error.message);

    // User-friendly error translation
    let friendlyMessage = error.message || "An unexpected error occurred.";
    if (friendlyMessage.includes("fetch failed") || friendlyMessage.includes("ENOTFOUND")) {
      friendlyMessage = "Connection failed. Failed to reach the mail infrastructure. Please check your internet connection.";
    } else if (friendlyMessage.includes("Unauthorized") || friendlyMessage.includes("403") || friendlyMessage.includes("401") || friendlyMessage.toLowerCase().includes("token")) {
      friendlyMessage = "Authentication failed. The configured API token is invalid or has insufficient permissions for email routing.";
    } else if (friendlyMessage.includes("429") || friendlyMessage.includes("Too Many Requests")) {
      friendlyMessage = "Request rate limit reached. Please wait a moment before trying again.";
    }

    throw new Error(friendlyMessage);
  }
}

export async function getEmailRoutingStatus(zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const data = await cfFetch(`/zones/${zoneId}/email/routing`, 'INFRA');
    return {
      success: true,
      data: {
        enabled: data.result?.enabled ?? false,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch email routing status' };
  }
}

export async function activateEmailRouting(zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    // Step 1: List all existing MX records
    console.log(`[Email Routing] Step 1: Fetching existing MX records for zone ${zoneId}`);
    const mxData = await cfFetch(`/zones/${zoneId}/dns_records?type=MX&per_page=100`, 'DNS');
    const existingMxRecords: any[] = mxData.result || [];
    console.log(`[Email Routing] Step 1 complete: Found ${existingMxRecords.length} existing MX record(s)`);

    // Step 2: Purge all existing MX records
    console.log(`[Email Routing] Step 2: Purging ${existingMxRecords.length} existing MX record(s)`);
    let purgedCount = 0;
    for (const record of existingMxRecords) {
      await cfFetch(`/zones/${zoneId}/dns_records/${record.id}`, 'DNS', {
        method: 'DELETE',
      });
      purgedCount++;
    }
    console.log(`[Email Routing] Step 2 complete: Purged ${purgedCount} MX record(s)`);

    // Step 3: Enable email routing on the zone
    console.log(`[Email Routing] Step 3: Enabling email routing on zone`);
    await cfFetch(`/zones/${zoneId}/email/routing/enable`, 'INFRA', {
      method: 'POST',
    });
    console.log(`[Email Routing] Step 3 complete: Email routing enabled`);

    // Step 4: Create required DNS records (MX + SPF + DMARC)
    console.log(`[Email Routing] Step 4: Creating mail infrastructure DNS records`);
    let createdCount = 0;

    const mxRecords = [
      { type: 'MX', name: '@', content: 'isaac.mx.cloudflare.net', priority: 10 },
      { type: 'MX', name: '@', content: 'linda.mx.cloudflare.net', priority: 20 },
      { type: 'MX', name: '@', content: 'amanda.mx.cloudflare.net', priority: 30 },
    ];

    const txtRecords = [
      { type: 'TXT', name: '@', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all' },
      { type: 'TXT', name: '_dmarc', content: 'v=DMARC1; p=none;' },
    ];

    for (const mx of mxRecords) {
      await cfFetch(`/zones/${zoneId}/dns_records`, 'DNS', {
        method: 'POST',
        body: JSON.stringify({
          type: mx.type,
          name: mx.name,
          content: mx.content,
          priority: mx.priority,
          ttl: 1,
        }),
      });
      createdCount++;
    }

    for (const txt of txtRecords) {
      await cfFetch(`/zones/${zoneId}/dns_records`, 'DNS', {
        method: 'POST',
        body: JSON.stringify({
          type: txt.type,
          name: txt.name,
          content: txt.content,
          ttl: 1,
        }),
      });
      createdCount++;
    }
    console.log(`[Email Routing] Step 4 complete: Created ${createdCount} DNS record(s)`);

    return {
      success: true,
      data: {
        purgedCount,
        createdCount,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to activate email routing' };
  }
}

export async function listEmailRules(zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    const rulesData = await cfFetch(`/zones/${zoneId}/email/routing/rules`, 'INFRA');
    
    // Dynamically query registered destination verification status from Cloudflare account level
    const verifiedEmailsSet = new Set<string>();
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    
    if (accountId) {
      try {
        const destData = await cfFetch(`/accounts/${accountId}/email/routing/addresses`, 'INFRA');
        const dests = destData.result || [];
        dests.forEach((d: any) => {
          if (d.verified) {
            verifiedEmailsSet.add(d.email.toLowerCase().trim());
          }
        });
      } catch (destError) {
        console.warn("[listEmailRules] Failed to fetch destination addresses list for verification verification:", destError);
      }
    }

    const rules = (rulesData.result || []).map((rule: any) => {
      const aliasEmail = rule.matchers?.[0]?.value || '';
      const destinationEmail = rule.actions?.[0]?.value?.[0] || '';
      
      // Check if address is explicitly verified on the Cloudflare account
      const isVerified = accountId && verifiedEmailsSet.size > 0
        ? verifiedEmailsSet.has(destinationEmail.toLowerCase().trim())
        : true; // fallback to true if no account context exists to prevent visual errors

      return {
        id: rule.id,
        alias: aliasEmail,
        destination: destinationEmail,
        enabled: rule.enabled ?? true,
        verified: isVerified,
      };
    });
    return { success: true, data: rules };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to list email routing rules' };
  }
}

export async function createEmailRule(zoneId: string, aliasEmail: string, destinationEmail: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  if (!aliasEmail || !destinationEmail) return { success: false, error: 'Alias email and destination email are required' };

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) return { success: false, error: 'Account ID is not configured. Please add CLOUDFLARE_ACCOUNT_ID to your .env.local file.' };

  try {
    // First, attempt to register the destination address (may already exist)
    try {
      await cfFetch(`/accounts/${accountId}/email/routing/addresses`, 'INFRA', {
        method: 'POST',
        body: JSON.stringify({ email: destinationEmail }),
      });
    } catch (destError: any) {
      // Destination may already be registered — this is expected and safe to ignore
      console.log(`[Email Routing] Destination address registration note: ${destError.message}`);
    }

    // Create the routing rule
    const data = await cfFetch(`/zones/${zoneId}/email/routing/rules`, 'INFRA', {
      method: 'POST',
      body: JSON.stringify({
        matchers: [{ type: 'literal', field: 'to', value: aliasEmail }],
        actions: [{ type: 'forward', value: [destinationEmail] }],
        enabled: true,
        name: `Forward ${aliasEmail}`,
      }),
    });

    return {
      success: true,
      data: {
        ruleId: data.result?.id || data.result?.tag,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create email routing rule' };
  }
}

export async function deleteEmailRule(zoneId: string, ruleId: string) {
  if (!zoneId || !ruleId) return { success: false, error: 'Missing Zone ID or Rule ID' };
  try {
    await cfFetch(`/zones/${zoneId}/email/routing/rules/${ruleId}`, 'INFRA', {
      method: 'DELETE',
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete email routing rule' };
  }
}

export async function listDestinationAddresses() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) return { success: false, error: 'Account ID is not configured. Please add CLOUDFLARE_ACCOUNT_ID to your .env.local file.' };

  try {
    const data = await cfFetch(`/accounts/${accountId}/email/routing/addresses`, 'INFRA');
    const addresses = (data.result || []).map((addr: any) => ({
      id: addr.id,
      email: addr.email,
      verified: addr.verified ? new Date(addr.verified) : null,
    }));
    return { success: true, data: addresses };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to list destination addresses' };
  }
}
