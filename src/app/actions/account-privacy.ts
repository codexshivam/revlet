'use server';

import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/firebase/admin';
import { assertStepUpMfa } from './auth-helper';
import { getEnrolledFactorCounts } from '@/lib/mfa-store';

/**
 * Exports all personal account data held by Revlet for the signed-in user
 * (Firebase Auth profile, safe user profile fields, MFA factor metadata without secrets,
 * workspaces, memberships, support tickets, and attributed crash telemetry).
 * Requires fresh Step-Up MFA verification.
 */
export async function exportPersonalAccountData(idToken: string, stepUpToken?: string) {
  if (!idToken) return { success: false, error: 'Authentication required.' };
  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const uid = decoded.uid;
    const email = (decoded.email || '').toLowerCase().trim();

    assertStepUpMfa(uid, stepUpToken);

    const [
      authUser,
      profileSnap,
      mfaCounts,
      ownedOrgsSnap,
      memberOrgsSnap,
      teamByUidSnap,
      ticketsSnap,
    ] = await Promise.all([
      adminAuth.getUser(uid),
      adminDb.collection('users').doc(uid).get(),
      getEnrolledFactorCounts(uid),
      adminDb.collection('organizations').where('ownerId', '==', uid).get(),
      adminDb.collection('organizations').where('memberIds', 'array-contains', uid).get(),
      adminDb.collection('teamMembers').where('memberUid', '==', uid).get(),
      adminDb.collection('supportTickets').where('ownerId', '==', uid).get(),
    ]);

    const profileData = profileSnap.exists ? profileSnap.data() || {} : {};
    // Allowlist safe profile fields — never export internal secret fields
    const safeProfile = {
      displayName: profileData.displayName || authUser.displayName || null,
      email: profileData.email || email || null,
      photoURL: profileData.photoURL || authUser.photoURL || null,
      theme: profileData.theme || null,
      timezone: profileData.timezone || null,
      locale: profileData.locale || null,
    };

    const workspaceMap = new Map<string, any>();
    for (const d of ownedOrgsSnap.docs) {
      const v = d.data() || {};
      workspaceMap.set(d.id, {
        id: d.id,
        name: v.name || '',
        domain: v.domain || '',
        role: 'owner',
        status: v.status || 'Active',
      });
    }
    for (const d of memberOrgsSnap.docs) {
      if (workspaceMap.has(d.id)) continue;
      const v = d.data() || {};
      workspaceMap.set(d.id, {
        id: d.id,
        name: v.name || '',
        domain: v.domain || '',
        role: 'member',
        status: v.status || 'Active',
      });
    }

    const exportedAt = new Date().toISOString();
    const bundle = {
      manifest: {
        exportType: 'personal_account_data',
        exportedAt,
        subjectUid: uid,
        subjectEmail: email || null,
        counts: {
          workspaces: workspaceMap.size,
          memberships: teamByUidSnap.size,
          supportTickets: ticketsSnap.size,
        },
        retentionNotes:
          'Organization-owned mail archives, legal holds, and immutable compliance audit logs are retained under organization retention policies.',
      },
      account: {
        uid: authUser.uid,
        email: authUser.email || null,
        emailVerified: authUser.emailVerified,
        displayName: authUser.displayName || null,
        createdAt: authUser.metadata.creationTime || null,
        lastSignInAt: authUser.metadata.lastSignInTime || null,
      },
      profile: safeProfile,
      securityFactors: {
        totpEnabled: mfaCounts.totpEnabled,
        passkeyCount: mfaCounts.passkeyCount,
        secondaryEmailVerified: mfaCounts.secondaryEmailVerified,
        secondaryEmail: mfaCounts.state.secondaryEmail || null,
      },
      workspaces: Array.from(workspaceMap.values()),
      memberships: teamByUidSnap.docs.map((d) => {
        const v = d.data() || {};
        return {
          id: d.id,
          organizationIds: v.organizationIds || [],
          status: v.status || 'Active',
          accessMode: v.accessMode || 'services',
          permissions: v.permissions || [],
        };
      }),
      supportTickets: ticketsSnap.docs.map((d) => {
        const v = d.data() || {};
        return {
          id: d.id,
          subject: v.subject || '',
          description: v.description || '',
          status: v.status || 'open',
          createdAt: v.createdAt || v.submittedAt || null,
        };
      }),
    };

    return { success: true, data: bundle };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to export account data.' };
  }
}

/**
 * Auditable personal account erasure workflow.
 * - Requires fresh Step-Up MFA and exact email confirmation.
 * - Blocks if the user still owns active organizations (transfer or delete them first).
 * - Removes memberships across non-owned organizations, deletes profile + MFA subcollections,
 *   records an anonymized erasure receipt, and deletes the Firebase Auth identity.
 */
export async function deletePersonalAccount(
  idToken: string,
  confirmationEmail: string,
  stepUpToken?: string
) {
  if (!idToken) return { success: false, error: 'Authentication required.' };
  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const uid = decoded.uid;
    const email = (decoded.email || '').toLowerCase().trim();

    if (!email || confirmationEmail.toLowerCase().trim() !== email) {
      return { success: false, error: 'Confirmation email does not match your signed-in account.' };
    }

    assertStepUpMfa(uid, stepUpToken);

    // Block erasure if the user still owns any organization so tenant data is never orphaned
    const ownedOrgsSnap = await adminDb
      .collection('organizations')
      .where('ownerId', '==', uid)
      .get();
    if (!ownedOrgsSnap.empty) {
      const names = ownedOrgsSnap.docs
        .map((d) => String(d.data()?.name || d.data()?.domain || d.id))
        .slice(0, 5)
        .join(', ');
      return {
        success: false,
        error: `You still own ${ownedOrgsSnap.size} organization(s) (${names}). Delete or transfer ownership of those organizations before deleting your personal account.`,
      };
    }

    // Disable Firebase Auth identity FIRST so a mid-erasure failure can never leave
    // an active account with its MFA factors stripped.
    await adminAuth.updateUser(uid, { disabled: true });
    await adminAuth.revokeRefreshTokens(uid);

    const userRef = adminDb.collection('users').doc(uid);
    const [memberOrgsSnap, teamSnap, privMfaSnap, passkeysSnap, challengesSnap] = await Promise.all([
      adminDb.collection('organizations').where('memberIds', 'array-contains', uid).get(),
      adminDb.collection('teamMembers').where('memberUid', '==', uid).get(),
      userRef.collection('privateMfa').get(),
      userRef.collection('mfaPasskeys').get(),
      userRef.collection('mfaChallenges').get(),
    ]);

    const permKey = `memberPermissions.${email.replace(/\./g, '__DOT__')}`;
    const ops: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];

    for (const orgDoc of memberOrgsSnap.docs) {
      ops.push((b) =>
        b.update(orgDoc.ref, {
          memberIds: FieldValue.arrayRemove(uid),
          memberEmails: FieldValue.arrayRemove(email),
          [permKey]: FieldValue.delete(),
        })
      );
      ops.push((b) => b.delete(orgDoc.ref.collection('members').doc(uid)));
    }

    for (const tDoc of teamSnap.docs) {
      ops.push((b) => b.delete(tDoc.ref));
    }
    for (const d of [...privMfaSnap.docs, ...passkeysSnap.docs, ...challengesSnap.docs]) {
      ops.push((b) => b.delete(d.ref));
    }
    ops.push((b) => b.delete(userRef));

    for (let i = 0; i < ops.length; i += 400) {
      const batch = adminDb.batch();
      ops.slice(i, i + 400).forEach((fn) => fn(batch));
      await batch.commit();
    }

    // Record anonymized auditable erasure receipt
    const uidHash = crypto.createHash('sha256').update(uid).digest('hex').slice(0, 24);
    await adminDb.collection('system').doc('erasureLogs').collection('records').add({
      uidHash,
      removedMembershipsCount: memberOrgsSnap.size,
      removedTeamDocsCount: teamSnap.size,
      erasedAt: new Date().toISOString(),
      timestamp: FieldValue.serverTimestamp(),
    });

    // Permanently delete Firebase Auth user
    await adminAuth.deleteUser(uid);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete personal account.' };
  }
}
