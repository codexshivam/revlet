import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/firebase/admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      return NextResponse.json({ ok: false, exists: false }, { status: 400 });
    }

    try {
      await adminAuth.getUserByEmail(email);
      return NextResponse.json({ ok: true, exists: true });
    } catch (err: any) {
      const code = err?.errorInfo?.code || err?.code || '';
      if (code === 'auth/user-not-found') {
        return NextResponse.json({ ok: true, exists: false });
      }
      throw err;
    }
  } catch {
    return NextResponse.json({ ok: false, exists: true }, { status: 500 });
  }
}
