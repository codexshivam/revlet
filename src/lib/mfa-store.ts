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

  // Atomically migrate legacy secret fields into /users/{uid}/privateMfa/state
  // and strip them from the client-readable /users/{uid} document in one transaction.
  return await adminDb.runTransaction(async (tx) => {
    const [freshPriv, freshUser] = await Promise.all([tx.get(privRef), tx.get(userRef)]);
    const pData = (freshPriv.exists ? freshPriv.data() : {}) as PrivateMfaState;
    const uData = (freshUser.exists ? freshUser.data() : {}) as Record<string, any>;

    const merged: PrivateMfaState = {
      totpEnabled: pData.totpEnabled ?? Boolean(uData.totpEnabled && uData.totpSecret),
      totpSecret: pData.totpSecret ?? uData.totpSecret ?? null,
      totpPendingSecret: pData.totpPendingSecret ?? uData.totpPendingSecret ?? null,
      secondaryEmail: pData.secondaryEmail ?? uData.secondaryEmail ?? '',
      secondaryEmailVerified:
        pData.secondaryEmailVerified ??
        Boolean(uData.secondaryEmailVerified && uData.secondaryEmail),
      secondaryOtpHash: pData.secondaryOtpHash ?? uData.secondaryOtpHash ?? null,
      secondaryOtpExpiresAt: pData.secondaryOtpExpiresAt ?? uData.secondaryOtpExpiresAt ?? null,
    };

    const deletePatch: Record<string, any> = {};
    for (const k of LEGACY_SECRET_KEYS) {
      if (uData[k] !== undefined) {
        deletePatch[k] = FieldValue.delete();
      }
    }

    tx.set(privRef, merged, { merge: true });
    if (freshUser.exists && Object.keys(deletePatch).length > 0) {
      tx.update(userRef, deletePatch);
    }

    return merged;
  });
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
  // Fail closed on database errors rather than silently returning false.
  const [orgsSnap, ownedSnap] = await Promise.all([
    adminDb.collection('organizations').where('memberIds', 'array-contains', uid).get(),
    adminDb.collection('organizations').where('ownerId', '==', uid).get(),
  ]);
  return (
    orgsSnap.docs.some((d) => Boolean(d.data()?.enforceMfa)) ||
    ownedSnap.docs.some((d) => Boolean(d.data()?.enforceMfa))
  );
}
