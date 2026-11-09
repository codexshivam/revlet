import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    env: {
      hasCloudflareToken: !!process.env.CLOUDFLARE_DNS_TOKEN,
      cloudflareTokenLength: process.env.CLOUDFLARE_DNS_TOKEN?.length || 0,
      hasServiceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      serviceAccountKeyLength: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length || 0,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'missing',
    },
    tests: {},
  };

  // Test 1: Firebase Admin Initialization & Firestore
  try {
    const { adminDb } = await import('@/firebase/admin');
    const doc = await adminDb.collection('organizations').doc('XnevCu1vmTcihlbVGiwJ').get();
    diagnostics.tests.firestore = {
      success: true,
      orgExists: doc.exists,
      orgName: doc.exists ? doc.data()?.name : null,
      zoneId: doc.exists ? doc.data()?.cloudflareZoneId : null,
    };
  } catch (err: any) {
    diagnostics.tests.firestore = {
      success: false,
      error: err.message,
      code: err.code,
    };
  }

  // Test 2: Cloudflare API Reachability
  try {
    const { cfFetch } = await import('@/app/actions/cf-fetch');
    const cfData = await cfFetch('/zones/b01f5fc25d042b813d59034710fe4476');
    diagnostics.tests.cloudflare = {
      success: true,
      zoneStatus: cfData?.result?.status,
      nameServers: cfData?.result?.name_servers,
    };
  } catch (err: any) {
    diagnostics.tests.cloudflare = {
      success: false,
      error: err.message,
    };
  }

  return NextResponse.json(diagnostics);
}
