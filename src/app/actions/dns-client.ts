const CLOUDFLARE_API_ORIGIN = 'https://api.cloudflare.com';

function buildSafeCloudflareUrl(path: string): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('\\')) {
    throw new Error('Invalid DNS API path.');
  }
  const target = new URL(`/client/v4${path}`, CLOUDFLARE_API_ORIGIN);
  if (target.origin !== CLOUDFLARE_API_ORIGIN) {
    throw new Error('Invalid DNS API origin.');
  }
  return target.toString();
}

export async function cfFetch(path: string, options: RequestInit = {}, customToken?: string) {
  const dnsToken = customToken || process.env.CLOUDFLARE_DNS_TOKEN;
  const safeLogPath = String(path || '').replace(/[\r\n\x00-\x1f\x7f]/g, '');

  const resolvedHeaders: Record<string, string> = {};

  if (options.body) {
    resolvedHeaders['Content-Type'] = 'application/json';
  }

  // High-fidelity sanitation: strip outer spaces and literal single/double quotes loaded from env
  const cleanToken = dnsToken?.trim().replace(/^["']|["']$/g, '');

  if (cleanToken) {
    resolvedHeaders['Authorization'] = `Bearer ${cleanToken}`;
  } else {
    console.error('[DNS Action] Missing edge authorization for request:', safeLogPath);
    throw new Error("Authorization failed. No active DNS authorization is configured for this organization.");
  }

  try {
    const targetUrl = buildSafeCloudflareUrl(path);
    const response = await fetch(targetUrl, {
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
      await response.text().catch(() => '');
      console.error('[DNS Action] Unexpected response format:', response.status, safeLogPath);
      throw new Error(`Edge network returned an unexpected response (${response.status}).`);
    }

    if (!response.ok) {
      const message = data.errors?.[0]?.message || data.message || `Edge request error (${response.status})`;
      const err = new Error(message);
      (err as any).status = response.status;
      throw err;
    }
    
    return data;
  } catch (error: any) {
    console.error('DNS action failure:', safeLogPath, 'status=', error?.status || 'unknown');
    
    // User-friendly network edge error translation (no internal tech/key details)
    let friendlyMessage = error.message || "An unexpected error occurred.";
    if (friendlyMessage.includes("fetch failed") || friendlyMessage.includes("ENOTFOUND")) {
      friendlyMessage = "Connection failed. Unable to reach the edge network. Please check your internet connection.";
    } else if (error.status === 403 || error.status === 401 || friendlyMessage.includes("Unauthorized") || friendlyMessage.toLowerCase().includes("token")) {
      if (path.includes('/dns_records')) {
        friendlyMessage = "Missing required DNS edit permissions. Please update your access permissions and try again.";
      } else {
        friendlyMessage = "Authorization failed. The configured access credentials are invalid or have insufficient permissions.";
      }
    } else if (error.status === 404 || friendlyMessage.includes("not found")) {
      friendlyMessage = "Requested DNS resource was not found.";
    } else if (error.status === 429 || friendlyMessage.includes("Too Many Requests")) {
      friendlyMessage = "Rate limit reached. Please wait a moment before trying again.";
    }
    
    throw new Error(friendlyMessage);
  }
}
