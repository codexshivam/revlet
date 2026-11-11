import crypto from 'crypto';

/**
 * Hashes a mailbox password with a 128-bit random salt using scrypt (64-byte derived key).
 */
export function hashMailPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

/**
 * Verifies a plaintext password against a stored `scrypt$<salt>$<derived>` hash
 * using constant-time comparison (`crypto.timingSafeEqual`).
 */
export function verifyMailPasswordHash(password: string, storedHash: string): boolean {
  if (!password || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Builds the canonical `emails` array for a Stalwart `individual` principal.
 * Rule: Index 0 MUST be `primaryEmail` so Stalwart JMAP `Identity/get` selects
 * the primary address first, followed by 1-to-1 aliases, followed by `@domain`
 * if this user is the active Catch-All fallback mailbox.
 */
export function buildCanonicalStalwartEmails(
  primaryEmail: string,
  aliases: string[],
  domain: string,
  isCatchAllTarget: boolean
): string[] {
  const primary = primaryEmail.toLowerCase().trim();
  const cleanAliases = (aliases || [])
    .map((a) => a.toLowerCase().trim())
    .filter((a) => a && a !== primary);

  const list = Array.from(new Set([primary, ...cleanAliases]));
  if (isCatchAllTarget && domain) {
    const catchAllEntry = `@${domain.toLowerCase().trim()}`;
    if (!list.includes(catchAllEntry)) {
      list.push(catchAllEntry);
    }
  }
  return list;
}
