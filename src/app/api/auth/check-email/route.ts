import { NextRequest, NextResponse } from 'next/server';

/**
 * Non-enumerating email pre-check endpoint.
 * Does not disclose whether an arbitrary email address is registered;
 * sign-up and sign-in rely on authenticated Firebase responses instead.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      return NextResponse.json({ ok: false, exists: false }, { status: 400 });
    }
    return NextResponse.json({ ok: true, exists: false });
  } catch {
    return NextResponse.json({ ok: false, exists: false }, { status: 500 });
  }
}
