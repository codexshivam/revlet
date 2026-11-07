const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

export async function cfFetch(path: string, options: RequestInit = {}) {
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
