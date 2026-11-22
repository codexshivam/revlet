import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/turnstile';

const ALLOWED_ACTIONS = new Set(['login', 'signup']);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = body?.token;
  const action = typeof body?.action === 'string' ? body.action.trim() : '';

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: 'Invalid verification action.' }, { status: 400 });
  }

  const clientIp =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    undefined;

  const verification = await verifyTurnstileToken({
    token,
    expectedAction: action,
    clientIp,
  });

  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, error: verification.error || 'Bot verification failed.' },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true });
}
