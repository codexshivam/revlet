import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';

export interface PrivateMfaState {
  totpEnabled?: boolean;
  totpSecret?: string | null;
  totpPendingSecret?: string | null;
  secondaryEmail?: string;
  secondaryEmailVerified?: boolean;
  secondaryOtpHash?: string | null;
  secondaryOtpExpiresAt?: number | null;
  lastPasswordAlertAt?: number;
}

const LEGACY_SECRET_KEYS = [
  'totpEnabled',
  'totpSecret',
  'totpPendingSecret',
  'secondaryEmail',
  'secondaryEmailVerified',
  'secondaryOtpHash',
  'secondaryOtpExpiresAt',
] as const;

export function getPrivateMfaRef(uid: string) {
  return adminDb.collection('users').doc(uid).collection('privateMfa').doc('state');
}

/**
 * Reads server-only MFA/recovery state from /users/{uid}/privateMfa/state.
 * If legacy fields still exist on /users/{uid}, migrates them atomically into
 * server-only storage and removes them from the client-readable profile doc.
 */
export async function readPrivateMfaState(uid: string): Promise<PrivateMfaState> {
  const userRef = adminDb.collection('users').doc(uid);
  const privRef = getPrivateMfaRef(uid);
  const [privSnap, userSnap] = await Promise.all([privRef.get(), userRef.get()]);

  const privData = (privSnap.exists ? privSnap.data() : {}) as PrivateMfaState;
  const userData = (userSnap.exists ? userSnap.data() : {}) as Record<string, any>;

  const hasLegacyFields = LEGACY_SECRET_KEYS.some((k) => userData[k] !== undefined);
  if (!hasLegacyFields) {
    return privData;
  }

  const merged: PrivateMfaState = {
    totpEnabled: privData.totpEnabled ?? Boolean(userData.totpEnabled && userData.totpSecret),
    totpSecret: privData.totpSecret ?? userData.totpSecret ?? null,
    totpPendingSecret: privData.totpPendingSecret ?? userData.totpPendingSecret ?? null,
    secondaryEmail: privData.secondaryEmail ?? userData.secondaryEmail ?? '',
    secondaryEmailVerified:
      privData.secondaryEmailVerified ??
      Boolean(userData.secondaryEmailVerified && userData.secondaryEmail),
    secondaryOtpHash: privData.secondaryOtpHash ?? userData.secondaryOtpHash ?? null,
    secondaryOtpExpiresAt: privData.secondaryOtpExpiresAt ?? userData.secondaryOtpExpiresAt ?? null,
  };

  // Migrate to server-only doc and strip legacy secret fields from client-readable /users/{uid}
  const deletePatch: Record<string, any> = {};
  for (const k of LEGACY_SECRET_KEYS) {
    if (userData[k] !== undefined) {
      deletePatch[k] = FieldValue.delete();
    }
  }
  await Promise.all([
    privRef.set(merged, { merge: true }),
    Object.keys(deletePatch).length > 0 ? userRef.update(deletePatch).catch(() => {}) : Promise.resolve(),
  ]);

  return merged;
}

export async function getEnrolledFactorCounts(uid: string): Promise<{
  totpEnabled: boolean;
  passkeyCount: number;
  secondaryEmailVerified: boolean;
  totalFactors: number;
  state: PrivateMfaState;
}> {
  const [state, passkeysSnap] = await Promise.all([
    readPrivateMfaState(uid),
    adminDb.collection('users').doc(uid).collection('mfaPasskeys').get(),
  ]);
  const totpEnabled = Boolean(state.totpEnabled && state.totpSecret);
  const secondaryEmailVerified = Boolean(state.secondaryEmailVerified && state.secondaryEmail);
  const passkeyCount = passkeysSnap.size;
  const totalFactors =
    (totpEnabled ? 1 : 0) + passkeyCount + (secondaryEmailVerified ? 1 : 0);
  return {
    totpEnabled,
    passkeyCount,
    secondaryEmailVerified,
    totalFactors,
    state,
  };
}

export async function checkUserEnforceMfa(uid: string): Promise<boolean> {
  try {
    const [orgsSnap, ownedSnap] = await Promise.all([
      adminDb.collection('organizations').where('memberIds', 'array-contains', uid).get(),
      adminDb.collection('organizations').where('ownerId', '==', uid).get(),
    ]);
    return (
      orgsSnap.docs.some((d) => Boolean(d.data()?.enforceMfa)) ||
      ownedSnap.docs.some((d) => Boolean(d.data()?.enforceMfa))
    );
  } catch {
    return false;
  }
}
