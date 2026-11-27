/**
 * Idempotent Security Architecture Backfill Script
 *
 * 1. Migrates any remaining legacy MFA secret fields from /users/{uid} into
 *    server-only /users/{uid}/privateMfa/state with AES-256-GCM envelope encryption.
 * 2. Encrypts any plaintext DKIM private keys in organizations/{orgId}/privateSecrets/dkim.
 * 3. Backfills authoritative organizations/{orgId}/members/{uid} subcollection records
 *    from existing organizations and Active teamMembers docs.
 *
 * Usage:
 *   npx tsx scripts/backfill-security-architecture.ts            # dry-run (default)
 *   npx tsx scripts/backfill-security-architecture.ts --apply    # commit writes
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../src/firebase/admin';
import { encryptToken } from '../src/lib/security/encryption';

const LEGACY_MFA_KEYS = [
  'totpEnabled',
  'totpSecret',
  'totpPendingSecret',
  'secondaryEmail',
  'secondaryEmailVerified',
  'secondaryOtpHash',
  'secondaryOtpExpiresAt',
] as const;

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`[Backfill] Starting in ${apply ? 'APPLY' : 'DRY-RUN'} mode...`);

  // 1. Backfill & encrypt legacy MFA fields on /users/{uid}
  const usersSnap = await adminDb.collection('users').get();
  let legacyMfaFound = 0;
  let legacyMfaMigrated = 0;

  for (const userDoc of usersSnap.docs) {
    const uData = userDoc.data() || {};
    const hasLegacy = LEGACY_MFA_KEYS.some((k) => uData[k] !== undefined);
    if (!hasLegacy) continue;
    legacyMfaFound++;

    if (apply) {
      const privRef = userDoc.ref.collection('privateMfa').doc('state');
      await adminDb.runTransaction(async (tx) => {
        const [freshPriv, freshUser] = await Promise.all([tx.get(privRef), tx.get(userDoc.ref)]);
        const pData = (freshPriv.exists ? freshPriv.data() : {}) as Record<string, any>;
        const fu = (freshUser.exists ? freshUser.data() : {}) as Record<string, any>;

        const plainTotp = pData.totpSecret || fu.totpSecret || null;
        const plainPending = pData.totpPendingSecret || fu.totpPendingSecret || null;

        const nextPriv: Record<string, any> = {
          totpEnabled: pData.totpEnabled ?? Boolean(fu.totpEnabled && plainTotp),
          totpSecret: FieldValue.delete(),
          totpPendingSecret: FieldValue.delete(),
          ...(plainTotp && !pData.totpSecretEncrypted
            ? { totpSecretEncrypted: encryptToken(String(plainTotp)) }
            : {}),
          ...(plainPending && !pData.totpPendingSecretEncrypted
            ? { totpPendingSecretEncrypted: encryptToken(String(plainPending)) }
            : {}),
          secondaryEmail: pData.secondaryEmail ?? fu.secondaryEmail ?? '',
          secondaryEmailVerified:
            pData.secondaryEmailVerified ?? Boolean(fu.secondaryEmailVerified && fu.secondaryEmail),
          secondaryOtpHash: pData.secondaryOtpHash ?? fu.secondaryOtpHash ?? null,
          secondaryOtpExpiresAt: pData.secondaryOtpExpiresAt ?? fu.secondaryOtpExpiresAt ?? null,
        };

        const deletePatch: Record<string, any> = {};
        for (const k of LEGACY_MFA_KEYS) {
          if (fu[k] !== undefined) deletePatch[k] = FieldValue.delete();
        }

        tx.set(privRef, nextPriv, { merge: true });
        if (Object.keys(deletePatch).length > 0) {
          tx.update(userDoc.ref, deletePatch);
        }
      });
      legacyMfaMigrated++;
    }
  }
  console.log(`[Backfill] Legacy MFA profiles found: ${legacyMfaFound}, migrated: ${legacyMfaMigrated}`);

  // 2. Backfill organizations/{orgId}/members/{uid} and encrypt plaintext DKIM keys
  const orgsSnap = await adminDb.collection('organizations').get();
  let dkimPlaintextFound = 0;
  let dkimEncryptedCount = 0;
  let memberDocsUpserted = 0;

  for (const orgDoc of orgsSnap.docs) {
    const orgData = orgDoc.data() || {};

    // 2a. Encrypt plaintext DKIM key if present
    const dkimRef = orgDoc.ref.collection('privateSecrets').doc('dkim');
    const dkimSnap = await dkimRef.get();
    if (dkimSnap.exists) {
      const dkimData = dkimSnap.data() || {};
      if (dkimData.privateKey && !dkimData.privateKeyEncrypted) {
        dkimPlaintextFound++;
        if (apply) {
          await dkimRef.update({
            privateKeyEncrypted: encryptToken(String(dkimData.privateKey)),
            privateKey: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          dkimEncryptedCount++;
        }
      }
    }

    // 2b. Ensure owner member subdoc exists
    if (orgData.ownerId) {
      const ownerMemberRef = orgDoc.ref.collection('members').doc(String(orgData.ownerId));
      const ownerSnap = await ownerMemberRef.get();
      if (!ownerSnap.exists) {
        memberDocsUpserted++;
        if (apply) {
          await ownerMemberRef.set(
            {
              uid: String(orgData.ownerId),
              email: orgData.ownerEmail || orgData.contactEmail || null,
              role: 'owner',
              permissions: ['*'],
              status: 'Active',
              joinedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      }
    }
  }

  // 2c. Backfill Active & Suspended teamMembers atomically into organizations/{orgId}/members/{uid} AND memberIds
  const allTeamSnap = await adminDb.collection('teamMembers').get();
  let suspendedReconciled = 0;
  for (const tDoc of allTeamSnap.docs) {
    const tData = tDoc.data() || {};
    const uid = tData.memberUid;
    if (!uid) continue;
    const status = String(tData.status || '');
    if (status !== 'Active' && status !== 'Suspended') continue;
    const orgIds: string[] = Array.isArray(tData.organizationIds)
      ? tData.organizationIds
      : tData.organizationId
      ? [tData.organizationId]
      : [];
    for (const orgId of orgIds) {
      const orgRef = adminDb.collection('organizations').doc(orgId);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) continue;
      const orgData = orgSnap.data() || {};
      const currentMemberIds: string[] = Array.isArray(orgData.memberIds) ? orgData.memberIds : [];
      const memberRef = orgRef.collection('members').doc(uid);
      const memberSnap = await memberRef.get();

      if (status === 'Suspended') {
        const needsFix =
          currentMemberIds.includes(uid) ||
          (memberSnap.exists && memberSnap.data()?.status === 'Active');
        if (needsFix) {
          suspendedReconciled++;
          if (apply) {
            const batch = adminDb.batch();
            batch.update(orgRef, { memberIds: FieldValue.arrayRemove(uid) });
            batch.set(
              memberRef,
              { uid, status: 'Suspended', updatedAt: FieldValue.serverTimestamp() },
              { merge: true }
            );
            await batch.commit();
          }
        }
        continue;
      }

      const perms = Array.isArray(tData.orgPermissions?.[orgId])
        ? tData.orgPermissions[orgId]
        : Array.isArray(tData.permissions)
        ? tData.permissions
        : [];
      const needsUpsert = !memberSnap.exists || !currentMemberIds.includes(uid);
      if (needsUpsert) {
        memberDocsUpserted++;
        if (apply) {
          const batch = adminDb.batch();
          batch.update(orgRef, { memberIds: FieldValue.arrayUnion(uid) });
          batch.set(
            memberRef,
            {
              uid,
              email: (tData.email || '').toLowerCase().trim() || null,
              status: 'Active',
              permissions: perms,
              accessMode: tData.accessMode || 'services',
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          await batch.commit();
        }
      }
    }
  }
  console.log(`[Backfill] Suspended memberships reconciled: ${suspendedReconciled}`);

  console.log(
    `[Backfill] Plaintext DKIM keys found: ${dkimPlaintextFound}, encrypted: ${dkimEncryptedCount}`
  );
  console.log(`[Backfill] Authoritative members/{uid} docs to upsert: ${memberDocsUpserted}`);
  console.log('[Backfill] Done.');
}

main().catch((err) => {
  console.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
