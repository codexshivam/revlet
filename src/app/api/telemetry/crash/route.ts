import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/firebase/admin';

const ALLOWED_ORIGINS = new Set([
  'https://app.revlet.me',
  'https://mail.revlet.me',
  'https://revlet.me',
  'http://localhost:9002',
  'http://localhost:9003',
]);

const MAX_PAYLOAD_BYTES = 12_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_IP = 15;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_PER_IP) return false;
  entry.count += 1;
  return true;
}

function sanitizeTelemetryUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Strip query parameters and fragments (which can contain action codes, tokens, or invite links)
    return `${u.origin}${u.pathname}`.slice(0, 500);
  } catch {
    return raw.split(/[?#]/)[0].slice(0, 500);
  }
}

function redactSensitiveText(raw: string, maxLen: number): string {
  return raw
    .replace(/(oobCode|token|code|secret|password|key|authorization)=([^&\s]+)/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .slice(0, maxLen);
}

function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://mail.revlet.me';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req),
  });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    if (!checkIpRateLimit(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Too many crash reports' },
        { status: 429, headers: corsHeaders }
      );
    }

    const rawText = await req.text();
    if (!rawText || rawText.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Payload too large or empty' },
        { status: 413, headers: corsHeaders }
      );
    }

    let body: any = null;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = null;
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Invalid crash telemetry payload' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Derive identity ONLY from a verified Firebase Bearer token — never trust caller-supplied userId/userEmail.
    let verifiedUserId: string | null = null;
    let verifiedUserEmail: string | null = null;
    const authHeader = req.headers.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (bearer) {
      try {
        const decoded = await adminAuth.verifyIdToken(bearer);
        verifiedUserId = decoded.uid;
        verifiedUserEmail = decoded.email ? decoded.email.toLowerCase() : null;
      } catch {
        // Unverified token: record anonymously rather than trusting spoofed identity
      }
    }

    const app = String(body.app || 'app.revlet.me').slice(0, 80);
    const appId = String(body.appId || '').slice(0, 120);
    const name = redactSensitiveText(String(body.name || 'Error'), 200);
    const message = redactSensitiveText(String(body.message || 'Unknown error'), 1500);
    const stack = typeof body.stack === 'string' ? redactSensitiveText(body.stack, 4000) : '';
    const digest = typeof body.digest === 'string' ? body.digest.slice(0, 120) : null;
    const fatal = Boolean(body.fatal);
    const component = String(body.component || 'runtime').slice(0, 120);
    const url = sanitizeTelemetryUrl(String(body.url || ''));
    const pathname = sanitizeTelemetryUrl(String(body.pathname || ''));
    const userAgent = String(req.headers.get('user-agent') || '').slice(0, 300);

    await adminDb.collection('crashReports').add({
      app,
      appId,
      name,
      message,
      stack,
      digest,
      fatal,
      component,
      url,
      pathname,
      userAgent,
      userId: verifiedUserId,
      userEmail: verifiedUserEmail,
      clientTimestamp: typeof body.timestamp === 'string' ? body.timestamp.slice(0, 64) : new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err) {
    console.warn('[Telemetry Crash Route] Non-fatal error recording crash report:', err);
    return NextResponse.json({ ok: false }, { status: 202, headers: corsHeaders });
  }
}
