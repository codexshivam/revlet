import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';

const ALLOWED_ORIGINS = new Set([
  'https://app.revlet.me',
  'https://mail.revlet.me',
  'https://revlet.me',
  'http://localhost:9002',
  'http://localhost:9003',
]);

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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Invalid crash telemetry payload' },
        { status: 400, headers: corsHeaders }
      );
    }

    const app = String(body.app || 'app.revlet.me').slice(0, 80);
    const appId = String(body.appId || '').slice(0, 120);
    const name = String(body.name || 'Error').slice(0, 200);
    const message = String(body.message || 'Unknown error').slice(0, 2000);
    const stack = typeof body.stack === 'string' ? body.stack.slice(0, 8000) : '';
    const digest = typeof body.digest === 'string' ? body.digest.slice(0, 120) : null;
    const fatal = Boolean(body.fatal);
    const component = String(body.component || 'runtime').slice(0, 120);
    const url = String(body.url || '').slice(0, 1000);
    const pathname = String(body.pathname || '').slice(0, 500);
    const userAgent = String(body.userAgent || req.headers.get('user-agent') || '').slice(0, 500);
    const userId = typeof body.userId === 'string' ? body.userId.slice(0, 128) : null;
    const userEmail = typeof body.userEmail === 'string' ? body.userEmail.slice(0, 254).toLowerCase() : null;
    const orgId = typeof body.orgId === 'string' ? body.orgId.slice(0, 128) : null;

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
      userId,
      userEmail,
      orgId,
      extra: body.extra && typeof body.extra === 'object' ? body.extra : null,
      clientTimestamp: typeof body.timestamp === 'string' ? body.timestamp : new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err) {
    console.warn('[Telemetry Crash Route] Non-fatal error recording crash report:', err);
    return NextResponse.json({ ok: false }, { status: 202, headers: corsHeaders });
  }
}
