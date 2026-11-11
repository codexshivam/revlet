import crypto from 'crypto';

/**
 * Envelope Encryption Helper using AES-256-GCM.
 * Used for zero-exposure storage of user-provided Cloudflare Scoped API Tokens.
 */

function getMasterKey(): Buffer {
  // Use dedicated secret if provided, or derive deterministically from server credentials
  const secret = 
    process.env.TOKEN_ENCRYPTION_SECRET || 
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || 
    process.env.CLOUDFLARE_DNS_TOKEN || 
    'revlet-secure-byot-envelope-encryption-salt-2026';

  return crypto.createHash('sha256').update(secret).digest();
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  masked: string;
}

/**
 * Encrypts a sensitive API token using AES-256-GCM.
 * Returns the ciphertext, 96-bit IV, 128-bit authentication tag, and a masked representation.
 */
export function encryptToken(token: string): EncryptedPayload {
  const cleanToken = token.trim();
  const key = getMasterKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(cleanToken, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  // Format masked preview: cf_••••••89aB
  const prefix = cleanToken.slice(0, 3);
  const suffix = cleanToken.slice(-4);
  const masked = `${prefix}••••••${suffix}`;

  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag,
    masked,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload back to the plaintext token.
 */
export function decryptToken(encrypted: { ciphertext: string; iv: string; tag: string }): string {
  if (!encrypted || !encrypted.ciphertext || !encrypted.iv || !encrypted.tag) {
    throw new Error('Invalid encrypted payload: Missing required cryptographic components.');
  }

  const key = getMasterKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));

  let decrypted = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
