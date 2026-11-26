import crypto from 'crypto';
import type { NextRequest } from 'next/server';

export interface StoredPasskey {
  id: string;
  label: string;
  createdAt: string;
  publicKeySpki?: string;
  publicKeyAlgorithm?: number;
  signCount?: number;
}

export function resolveExpectedRpId(req: NextRequest): string {
  const host = req.nextUrl.hostname || 'app.revlet.me';
  return host === '127.0.0.1' ? 'localhost' : host;
}

export function resolveAllowedOrigins(req: NextRequest): string[] {
  const origins = new Set<string>();
  const reqOrigin = req.nextUrl.origin;
  if (reqOrigin && reqOrigin !== 'null') origins.add(reqOrigin);
  const headerOrigin = (req.headers.get('origin') || '').trim();
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').trim();
  const proto = (req.headers.get('x-forwarded-proto') || (req.nextUrl.protocol.replace(':', '') || 'https')).trim();
  if (host) {
    origins.add(`${proto}://${host}`);
  }
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (appUrl) {
    try {
      origins.add(new URL(appUrl).origin);
    } catch {
      // ignore invalid env URL
    }
  }
  if (headerOrigin) {
    try {
      const parsed = new URL(headerOrigin);
      const rpId = resolveExpectedRpId(req);
      if (parsed.hostname === rpId || (rpId === 'localhost' && parsed.hostname === '127.0.0.1')) {
        origins.add(parsed.origin);
      }
    } catch {
      // ignore
    }
  }
  return Array.from(origins);
}

function parseClientData(clientDataJSONB64u: string): { raw: Buffer; parsed: any } | null {
  try {
    const raw = Buffer.from(clientDataJSONB64u, 'base64url');
    if (raw.length === 0) return null;
    const parsed = JSON.parse(raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    return { raw, parsed };
  } catch {
    return null;
  }
}

function verifyRpIdHashAndFlags(
  authData: Buffer,
  expectedRpId: string,
  requireAttestedData = false
): { ok: true; signCount: number } | { ok: false; error: string } {
  if (authData.length < 37) {
    return { ok: false, error: 'Malformed authenticator data.' };
  }
  const rpIdHash = authData.subarray(0, 32);
  const expectedHash = crypto.createHash('sha256').update(expectedRpId, 'utf8').digest();
  if (!crypto.timingSafeEqual(rpIdHash, expectedHash)) {
    return { ok: false, error: 'Passkey RP ID mismatch.' };
  }
  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  if (!userPresent) {
    return { ok: false, error: 'Passkey user presence check failed.' };
  }
  if (requireAttestedData && (flags & 0x40) === 0) {
    return { ok: false, error: 'Passkey attestation data missing.' };
  }
  const signCount = authData.readUInt32BE(33);
  return { ok: true, signCount };
}

export function verifyPasskeyRegistration(params: {
  req: NextRequest;
  expectedChallenge: string;
  credentialId: string;
  clientDataJSON: string;
  publicKeySpki: string;
  publicKeyAlgorithm: number;
  authenticatorData?: string;
}): { ok: true; signCount: number } | { ok: false; error: string } {
  if (!params.credentialId.trim()) {
    return { ok: false, error: 'Missing passkey credential ID.' };
  }
  const cd = parseClientData(params.clientDataJSON);
  if (!cd) {
    return { ok: false, error: 'Invalid passkey clientDataJSON.' };
  }
  if (cd.parsed.type !== 'webauthn.create' || cd.parsed.challenge !== params.expectedChallenge) {
    return { ok: false, error: 'Passkey challenge mismatch.' };
  }
  const allowedOrigins = resolveAllowedOrigins(params.req);
  if (typeof cd.parsed.origin !== 'string' || !allowedOrigins.includes(cd.parsed.origin)) {
    return { ok: false, error: 'Passkey origin mismatch.' };
  }

  if (params.publicKeyAlgorithm !== -7 && params.publicKeyAlgorithm !== -257) {
    return { ok: false, error: 'Unsupported passkey public key algorithm.' };
  }
  if (!params.publicKeySpki.trim()) {
    return { ok: false, error: 'Missing passkey public key.' };
  }
  try {
    const spkiBuf = Buffer.from(params.publicKeySpki, 'base64url');
    const keyObj = crypto.createPublicKey({ key: spkiBuf, format: 'der', type: 'spki' });
    if (params.publicKeyAlgorithm === -7 && keyObj.asymmetricKeyType !== 'ec') {
      return { ok: false, error: 'Passkey key type does not match ES256.' };
    }
    if (params.publicKeyAlgorithm === -257 && keyObj.asymmetricKeyType !== 'rsa') {
      return { ok: false, error: 'Passkey key type does not match RS256.' };
    }
  } catch {
    return { ok: false, error: 'Invalid passkey public key format.' };
  }

  let signCount = 0;
  if (params.authenticatorData) {
    const authBuf = Buffer.from(params.authenticatorData, 'base64url');
    const check = verifyRpIdHashAndFlags(authBuf, resolveExpectedRpId(params.req), true);
    if (!check.ok) return check;
    signCount = check.signCount;
  }

  return { ok: true, signCount };
}

export function verifyPasskeyAssertion(params: {
  req: NextRequest;
  expectedChallenge: string;
  passkey: StoredPasskey;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}): { ok: true; nextSignCount: number } | { ok: false; error: string } {
  if (!params.passkey.publicKeySpki) {
    return {
      ok: false,
      error: 'This passkey was enrolled before signature verification was enabled. Please remove and re-register your passkey.',
    };
  }
  if (!params.authenticatorData || !params.signature) {
    return { ok: false, error: 'Missing passkey authenticator data or signature.' };
  }

  const cd = parseClientData(params.clientDataJSON);
  if (!cd) {
    return { ok: false, error: 'Invalid passkey clientDataJSON.' };
  }
  if (cd.parsed.type !== 'webauthn.get' || cd.parsed.challenge !== params.expectedChallenge) {
    return { ok: false, error: 'Passkey assertion mismatch.' };
  }
  const allowedOrigins = resolveAllowedOrigins(params.req);
  if (typeof cd.parsed.origin !== 'string' || !allowedOrigins.includes(cd.parsed.origin)) {
    return { ok: false, error: 'Passkey origin mismatch.' };
  }

  const authBuf = Buffer.from(params.authenticatorData, 'base64url');
  const rpCheck = verifyRpIdHashAndFlags(authBuf, resolveExpectedRpId(params.req), false);
  if (!rpCheck.ok) {
    return rpCheck;
  }

  const prevCount = typeof params.passkey.signCount === 'number' ? params.passkey.signCount : 0;
  if (prevCount > 0 && rpCheck.signCount > 0 && rpCheck.signCount <= prevCount) {
    return { ok: false, error: 'Passkey signature counter regression detected.' };
  }

  try {
    const spkiBuf = Buffer.from(params.passkey.publicKeySpki, 'base64url');
    const publicKey = crypto.createPublicKey({ key: spkiBuf, format: 'der', type: 'spki' });
    const clientDataHash = crypto.createHash('sha256').update(cd.raw).digest();
    const signedPayload = Buffer.concat([authBuf, clientDataHash]);
    const signatureBuf = Buffer.from(params.signature, 'base64url');

    const verified = crypto.verify(
      'sha256',
      signedPayload,
      publicKey.asymmetricKeyType === 'ec'
        ? { key: publicKey, dsaEncoding: 'der' }
        : { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      signatureBuf
    );
    if (!verified) {
      return { ok: false, error: 'Passkey cryptographic signature verification failed.' };
    }
  } catch {
    return { ok: false, error: 'Passkey signature verification error.' };
  }

  return { ok: true, nextSignCount: rpCheck.signCount };
}
