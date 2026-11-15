import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(byteLength = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(secret: string): Buffer {
  const cleaned = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, counterOffset = 0, stepSeconds = 30): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(Date.now() / 1000 / stepSeconds) + counterOffset;
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, code: string, window = 1): boolean {
  const normalized = code.replace(/\s+/g, '').trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  for (let offset = -window; offset <= window; offset++) {
    const expected = generateTotpCode(secret, offset);
    if (
      crypto.timingSafeEqual(
        Buffer.from(expected, 'utf8'),
        Buffer.from(normalized, 'utf8')
      )
    ) {
      return true;
    }
  }
  return false;
}

export function buildOtpAuthUri(accountEmail: string, secret: string, issuer = 'Revlet'): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const iss = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`;
}

function getStepUpSigningKey(): Buffer {
  const secret = (
    process.env.TOKEN_ENCRYPTION_SECRET ||
    process.env.REVLET_MAIL_INTERNAL_SECRET ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    ''
  ).trim();
  if (!secret) {
    throw new Error('Server signing secret is not configured for Step-Up MFA.');
  }
  return crypto.createHash('sha256').update(`revlet-stepup:${secret}`).digest();
}

export interface StepUpTokenPayload {
  uid: string;
  email: string;
  method: 'totp' | 'passkey' | 'secondary_email' | 'firebase_mfa';
  iat: number;
  exp: number;
}

export function createStepUpToken(
  payload: Omit<StepUpTokenPayload, 'iat' | 'exp'>,
  ttlSeconds = 600
): string {
  const now = Date.now();
  const fullPayload: StepUpTokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getStepUpSigningKey())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyStepUpToken(token: string | undefined | null, expectedUid: string): StepUpTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getStepUpSigningKey())
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(providedSig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as StepUpTokenPayload;
    if (!decoded || decoded.uid !== expectedUid) return null;
    if (typeof decoded.exp !== 'number' || decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function hashOtpCode(uid: string, code: string): string {
  return crypto
    .createHmac('sha256', getStepUpSigningKey())
    .update(`${uid}:${code.trim()}`)
    .digest('hex');
}
