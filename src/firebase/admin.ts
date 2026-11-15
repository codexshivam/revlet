import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY && !process.env.FIREBASE_PRIVATE_KEY) {
  try {
    loadEnvConfig(process.cwd());
  } catch {
    // Ignore env loading errors in edge/restricted runtimes
  }
}

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const googleAppCredsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || 'revlet';

const apps = getApps();
let app;

if (!apps.length) {
  if (serviceAccountKey) {
    try {
      // Support both raw JSON and base64 encoded
      const cleaned = serviceAccountKey.trim().replace(/^["']|["']$/g, '');
      let jsonStr;
      
      try {
        JSON.parse(cleaned);
        jsonStr = cleaned;
      } catch {
        jsonStr = Buffer.from(cleaned, 'base64').toString('utf-8');
      }

      const credentials = JSON.parse(jsonStr);
      app = initializeApp({
        credential: cert(credentials),
        projectId: credentials.project_id || firebaseProjectId,
      });
    } catch (e) {
      console.warn("Could not parse FIREBASE_SERVICE_ACCOUNT_KEY, trying fallback credentials", e);
    }
  }

  if (!app && googleAppCredsPath && fs.existsSync(googleAppCredsPath)) {
    try {
      const credentials = JSON.parse(fs.readFileSync(googleAppCredsPath, 'utf-8'));
      app = initializeApp({
        credential: cert(credentials),
        projectId: credentials.project_id || firebaseProjectId,
      });
    } catch (e) {
      console.warn("Could not initialize Firebase Admin from GOOGLE_APPLICATION_CREDENTIALS", e);
    }
  }

  // If not initialized via service account key, check for individual credentials
  if (!app && firebaseClientEmail && firebasePrivateKey && firebaseProjectId) {
    try {
      const formattedKey = firebasePrivateKey.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');
      app = initializeApp({
        credential: cert({
          projectId: firebaseProjectId,
          clientEmail: firebaseClientEmail,
          privateKey: formattedKey,
        })
      });
    } catch (e) {
      console.warn("Could not initialize Firebase Admin with individual credentials, trying ADC", e);
    }
  }

  // Fallback to ADC / project ID only
  if (!app) {
    app = initializeApp({ 
      projectId: firebaseProjectId 
    });
  }
} else {
  app = apps[0];
}

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
try {
  adminDb.settings({ ignoreUndefinedProperties: true });
} catch {
  // Settings already frozen or initialized
}
