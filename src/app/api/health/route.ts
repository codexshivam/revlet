import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * High-performance 24/7 Health Check API
 * - Default: fast process liveness probe
 * - ?readiness=1: verifies live Firestore connectivity (returns 503 if unavailable)
 */
export async function GET(req: NextRequest) {
  try {
    const checkReadiness = req.nextUrl.searchParams.get('readiness') === '1';
    if (checkReadiness) {
      await adminDb.collection('system').doc('schedulerState').get();
    }

    return NextResponse.json(
      {
        status: 'healthy',
        readiness: checkReadiness ? 'ok' : undefined,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'production',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }
}
