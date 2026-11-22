export interface TurnstileVerifyResult {
  ok: boolean;
  error?: string;
}

export async function verifyTurnstileToken(params: {
  token: unknown;
  expectedAction: string;
  clientIp?: string;
}): Promise<TurnstileVerifyResult> {
  const { token, expectedAction, clientIp } = params;
  const secret = (process.env.TURNSTILE_SECRET || '').trim();
  const expectedHostnames = new Set(
    (process.env.TURNSTILE_HOSTNAMES || '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );

  if (!secret || expectedHostnames.size === 0) {
    return { ok: false, error: 'Bot verification service is not configured.' };
  }

  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { ok: false, error: 'Please complete the security check and try again.' };
  }

  const form = new URLSearchParams({
    secret,
    response: token,
  });
  if (clientIp && clientIp !== 'unknown') {
    form.set('remoteip', clientIp);
  }

  let data: { success?: boolean; action?: string; hostname?: string };
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: form,
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, error: 'Security verification failed. Please retry.' };
    }
    data = await res.json();
  } catch {
    return { ok: false, error: 'Security verification failed. Please retry.' };
  }

  if (
    data.success !== true ||
    data.action !== expectedAction ||
    !data.hostname ||
    !expectedHostnames.has(data.hostname.toLowerCase())
  ) {
    return { ok: false, error: 'Security check expired or invalid. Please try again.' };
  }

  return { ok: true };
}
