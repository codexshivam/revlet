'use server';

import { adminAuth, adminDb } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ORG_ADMIN_PERMISSION, ADMIN_ALL_PERMISSIONS } from '@/lib/team-permissions';

async function verifyCaller(idToken: string) {
  if (!idToken) throw new Error('Unauthorized: Missing credentials.');
  const decoded = await adminAuth.verifyIdToken(idToken);
  return {
    uid: decoded.uid,
    email: (decoded.email || '').toLowerCase().trim(),
    name: decoded.name || decoded.email || 'Organization Owner',
  };
}

function callerHasOrgAdmin(orgData: any, caller: { uid: string; email: string }): boolean {
  if (!orgData) return false;
  if (orgData.ownerId === caller.uid) return true;
  if (!caller.email) return false;
  const emailKey = caller.email.replace(/\./g, '__DOT__');
  const perms: string[] = orgData.memberPermissions?.[emailKey] || [];
  return Array.isArray(perms) && perms.includes(ORG_ADMIN_PERMISSION);
}

/**
 * Lists organizations the caller can manage (owned or Admin-invited) and their team members.
 */
export async function listTeamManagementData(idToken: string) {
  try {
    const caller = await verifyCaller(idToken);

    const [ownedSnap, memberSnap] = await Promise.all([
      adminDb.collection('organizations').where('ownerId', '==', caller.uid).get(),
      caller.email
        ? adminDb.collection('organizations').where('memberEmails', 'array-contains', caller.email).get()
        : Promise.resolve(null),
    ]);

    const orgMap = new Map<string, any>();
    for (const doc of ownedSnap.docs) {
      const data = doc.data();
      if (data.status !== 'Pending Deletion') {
        orgMap.set(doc.id, { id: doc.id, name: data.name, domain: data.domain, ownerId: data.ownerId });
      }
    }
    if (memberSnap) {
      for (const doc of memberSnap.docs) {
        const data = doc.data();
        if (data.status !== 'Pending Deletion' && callerHasOrgAdmin(data, caller)) {
          orgMap.set(doc.id, { id: doc.id, name: data.name, domain: data.domain, ownerId: data.ownerId });
        }
      }
    }

    const manageableOrgs = Array.from(orgMap.values());
    const manageableOrgIds = new Set(manageableOrgs.map((o) => o.id));

    if (manageableOrgIds.size === 0) {
      return { success: true, data: { orgs: [], members: [] } };
    }

    // Fetch teamMembers owned by caller OR referencing any manageable org (chunked to avoid 10-item limits)
    const memberDocsMap = new Map<string, any>();
    const orgIdList = Array.from(manageableOrgIds);
    const orgIdChunks: string[][] = [];
    for (let i = 0; i < orgIdList.length; i += 10) {
      orgIdChunks.push(orgIdList.slice(i, i + 10));
    }

    const byOwnerSnap = await adminDb.collection('teamMembers').where('ownerId', '==', caller.uid).get();
    const byOrgSnaps = await Promise.all(
      orgIdChunks.map((chunk) =>
        adminDb.collection('teamMembers').where('organizationIds', 'array-contains-any', chunk).get()
      )
    );

    for (const snap of [byOwnerSnap, ...byOrgSnaps]) {
      for (const doc of snap.docs) {
        const data = doc.data();
        if ((data.email || '').toLowerCase().trim() === caller.email) continue;
        memberDocsMap.set(doc.id, {
          id: doc.id,
          email: data.email,
          organizationId: data.organizationId,
          organizationIds: data.organizationIds || (data.organizationId ? [data.organizationId] : []),
          permissions: data.permissions || [],
          orgPermissions: data.orgPermissions || undefined,
          accessMode: data.accessMode || ((data.permissions || []).includes(ORG_ADMIN_PERMISSION) ? 'admin' : 'services'),
          status: data.status || 'Pending',
          invitedBy: data.invitedBy,
        });
      }
    }

    return {
      success: true,
      data: {
        orgs: manageableOrgs,
        members: Array.from(memberDocsMap.values()),
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load team management data.' };
  }
}

/**
 * Invites a team member to one or more owned organizations with granular service-level permissions.
 * Only organization owners can invite team members.
 */
export async function inviteTeamMember(
  idToken: string,
  params: {
    email: string;
    organizationIds: string[];
    accessMode?: 'admin' | 'services';
    permissions: string[];
    orgPermissions?: Record<string, string[]>;
  }
) {
  try {
    const caller = await verifyCaller(idToken);
    const targetEmail = (params.email || '').toLowerCase().trim();
    const orgIds = Array.from(new Set((params.organizationIds || []).filter(Boolean)));
    const fallbackAccessMode: 'admin' | 'services' = params.accessMode === 'admin' ? 'admin' : 'services';
    const fallbackPermissions =
      fallbackAccessMode === 'admin'
        ? [...ADMIN_ALL_PERMISSIONS]
        : Array.from(new Set((params.permissions || []).filter((p) => Boolean(p) && p !== ORG_ADMIN_PERMISSION)));

    // Build normalized per-organization permissions map
    const resolvedOrgPermissions: Record<string, string[]> = {};
    for (const oid of orgIds) {
      const rawPerms = params.orgPermissions?.[oid] || fallbackPermissions;
      const isOrgAdmin = rawPerms.includes(ORG_ADMIN_PERMISSION);
      resolvedOrgPermissions[oid] = isOrgAdmin
        ? [...ADMIN_ALL_PERMISSIONS]
        : Array.from(new Set(rawPerms.filter((p) => Boolean(p) && p !== ORG_ADMIN_PERMISSION)));
    }
    const permissions = Array.from(new Set(Object.values(resolvedOrgPermissions).flat()));
    const accessMode: 'admin' | 'services' = permissions.includes(ORG_ADMIN_PERMISSION)
      ? 'admin'
      : 'services';

    if (!targetEmail || !targetEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid work email address.' };
    }
    if (targetEmail === caller.email) {
      return { success: false, error: 'You cannot invite your own account email.' };
    }
    if (orgIds.length === 0) {
      return { success: false, error: 'Select at least one organization.' };
    }
    for (const oid of orgIds) {
      if ((resolvedOrgPermissions[oid] || []).length === 0) {
        return { success: false, error: 'Select at least one permission for each selected organization.' };
      }
    }

    // Verify caller is owner or Org Admin for EVERY selected organization
    const orgDocs = await Promise.all(
      orgIds.map((id) => adminDb.collection('organizations').doc(id).get())
    );
    for (const orgDoc of orgDocs) {
      if (!orgDoc.exists) {
        return { success: false, error: 'One or more selected organizations no longer exist.' };
      }
      if (!callerHasOrgAdmin(orgDoc.data(), caller)) {
        return {
          success: false,
          error: 'Only an organization owner or Admin can invite team members.',
        };
      }
    }

    // Resolve caller display name from users collection if available
    let ownerDisplayName = caller.name;
    try {
      const callerUserDoc = await adminDb.collection('users').doc(caller.uid).get();
      const callerDisplay = callerUserDoc.data()?.displayName;
      if (callerDisplay) ownerDisplayName = callerDisplay;
    } catch {
      // Fallback to token name/email
    }

    // Check if the invited email already has an activated Revlet account
    let existingUserUid: string | null = null;
    try {
      const existingAuthUser = await adminAuth.getUserByEmail(targetEmail);
      if (existingAuthUser?.uid) {
        existingUserUid = existingAuthUser.uid;
      }
    } catch {
      // User does not exist yet -> invitation starts as Pending
    }

    const initialStatus: 'Active' | 'Pending' = existingUserUid ? 'Active' : 'Pending';

    // Check if this owner already has a teamMembers record for this email
    const existingMemberSnap = await adminDb
      .collection('teamMembers')
      .where('ownerId', '==', caller.uid)
      .where('email', '==', targetEmail)
      .limit(1)
      .get();

    let memberId: string;
    if (!existingMemberSnap.empty) {
      const existingDoc = existingMemberSnap.docs[0];
      const existingData = existingDoc.data();
      const mergedOrgIds = Array.from(
        new Set([
          ...(Array.isArray(existingData.organizationIds)
            ? existingData.organizationIds
            : existingData.organizationId
            ? [existingData.organizationId]
            : []),
          ...orgIds,
        ])
      );
      const mergedOrgPermissions: Record<string, string[]> = {
        ...(existingData.orgPermissions || {}),
        ...resolvedOrgPermissions,
      };
      const mergedFlatPerms = Array.from(new Set(Object.values(mergedOrgPermissions).flat()));
      await existingDoc.ref.update({
        organizationIds: mergedOrgIds,
        organizationId: mergedOrgIds[0],
        accessMode: mergedFlatPerms.includes(ORG_ADMIN_PERMISSION) ? 'admin' : 'services',
        permissions: mergedFlatPerms,
        orgPermissions: mergedOrgPermissions,
        ownerName: ownerDisplayName,
        status: existingData.status === 'Suspended' ? 'Suspended' : initialStatus,
        ...(existingUserUid ? { memberUid: existingUserUid } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      memberId = existingDoc.id;
    } else {
      const createdRef = await adminDb.collection('teamMembers').add({
        email: targetEmail,
        organizationIds: orgIds,
        organizationId: orgIds[0],
        ownerId: caller.uid,
        ownerName: ownerDisplayName,
        accessMode,
        permissions,
        orgPermissions: resolvedOrgPermissions,
        status: initialStatus,
        ...(existingUserUid ? { memberUid: existingUserUid } : {}),
        invitedAt: FieldValue.serverTimestamp(),
      });
      memberId = createdRef.id;
    }

    // Allocate organizations (unless suspended)
    const batch = adminDb.batch();
    for (const orgDoc of orgDocs) {
      const orgPerms = resolvedOrgPermissions[orgDoc.id] || permissions;
      batch.update(orgDoc.ref, {
        ownerName: ownerDisplayName,
        memberEmails: FieldValue.arrayUnion(targetEmail),
        [`memberPermissions.${targetEmail.replace(/\./g, '__DOT__')}`]: orgPerms,
      });
    }
    await batch.commit();

    return {
      success: true,
      data: {
        id: memberId,
        email: targetEmail,
        status: initialStatus,
        organizationIds: orgIds,
        permissions,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to invite team member.' };
  }
}

/**
 * Suspends or reactivates a team member across all allocated organizations.
 */
export async function updateTeamMemberStatus(
  idToken: string,
  memberId: string,
  newStatus: 'Active' | 'Suspended'
) {
  try {
    const caller = await verifyCaller(idToken);
    const memberRef = adminDb.collection('teamMembers').doc(memberId);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) {
      return { success: false, error: 'Team member record not found.' };
    }

    const data = memberDoc.data()!;
    const orgIds: string[] = Array.isArray(data.organizationIds)
      ? data.organizationIds
      : data.organizationId
      ? [data.organizationId]
      : [];

    const orgDocs = await Promise.all(
      orgIds.map((id) => adminDb.collection('organizations').doc(id).get())
    );
    const canManage =
      data.ownerId === caller.uid ||
      orgDocs.some((docSnap) => docSnap.exists && callerHasOrgAdmin(docSnap.data(), caller));
    if (!canManage) {
      return { success: false, error: 'Only an organization owner or Admin can modify team member status.' };
    }

    const targetEmail = (data.email || '').toLowerCase().trim();

    // If reactivating a user who never signed up yet, keep as Pending
    let resolvedStatus: 'Active' | 'Pending' | 'Suspended' = newStatus;
    if (newStatus === 'Active' && !data.memberUid) {
      try {
        const authUser = await adminAuth.getUserByEmail(targetEmail);
        if (!authUser?.uid) resolvedStatus = 'Pending';
      } catch {
        resolvedStatus = 'Pending';
      }
    }

    await memberRef.update({
      status: resolvedStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const batch = adminDb.batch();
    for (const orgId of orgIds) {
      const orgRef = adminDb.collection('organizations').doc(orgId);
      if (resolvedStatus === 'Suspended') {
        batch.update(orgRef, {
          memberEmails: FieldValue.arrayRemove(targetEmail),
        });
      } else {
        batch.update(orgRef, {
          memberEmails: FieldValue.arrayUnion(targetEmail),
          [`memberPermissions.${targetEmail.replace(/\./g, '__DOT__')}`]:
            data.orgPermissions?.[orgId] || data.permissions || [],
        });
      }
    }
    await batch.commit();

    return { success: true, data: { status: resolvedStatus } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update member status.' };
  }
}

/**
 * Updates a team member's allocated organizations and service-level permissions.
 */
export async function updateTeamMemberAccess(
  idToken: string,
  memberId: string,
  params: {
    organizationIds: string[];
    accessMode?: 'admin' | 'services';
    permissions: string[];
    orgPermissions?: Record<string, string[]>;
  }
) {
  try {
    const caller = await verifyCaller(idToken);
    const memberRef = adminDb.collection('teamMembers').doc(memberId);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) {
      return { success: false, error: 'Team member record not found.' };
    }

    const data = memberDoc.data()!;
    const prevOrgIds: string[] = Array.isArray(data.organizationIds)
      ? data.organizationIds
      : data.organizationId
      ? [data.organizationId]
      : [];

    const nextOrgIds = Array.from(new Set((params.organizationIds || []).filter(Boolean)));
    const fallbackAccessMode: 'admin' | 'services' = params.accessMode === 'admin' ? 'admin' : 'services';
    const fallbackPermissions =
      fallbackAccessMode === 'admin'
        ? [...ADMIN_ALL_PERMISSIONS]
        : Array.from(new Set((params.permissions || []).filter((p) => Boolean(p) && p !== ORG_ADMIN_PERMISSION)));

    const resolvedOrgPermissions: Record<string, string[]> = {};
    for (const oid of nextOrgIds) {
      const rawPerms = params.orgPermissions?.[oid] || fallbackPermissions;
      const isOrgAdmin = rawPerms.includes(ORG_ADMIN_PERMISSION);
      resolvedOrgPermissions[oid] = isOrgAdmin
        ? [...ADMIN_ALL_PERMISSIONS]
        : Array.from(new Set(rawPerms.filter((p) => Boolean(p) && p !== ORG_ADMIN_PERMISSION)));
    }
    const nextPermissions = Array.from(new Set(Object.values(resolvedOrgPermissions).flat()));
    const accessMode: 'admin' | 'services' = nextPermissions.includes(ORG_ADMIN_PERMISSION)
      ? 'admin'
      : 'services';

    if (nextOrgIds.length === 0) {
      return { success: false, error: 'Select at least one organization.' };
    }
    for (const oid of nextOrgIds) {
      if ((resolvedOrgPermissions[oid] || []).length === 0) {
        return { success: false, error: 'Select at least one permission for each selected organization.' };
      }
    }

    // Verify caller is owner or Org Admin of all new orgs
    const nextOrgDocs = await Promise.all(
      nextOrgIds.map((id) => adminDb.collection('organizations').doc(id).get())
    );
    for (const docSnap of nextOrgDocs) {
      if (!docSnap.exists || !callerHasOrgAdmin(docSnap.data(), caller)) {
        return { success: false, error: 'Only an organization owner or Admin can assign organization access.' };
      }
    }

    const targetEmail = (data.email || '').toLowerCase().trim();
    const permKey = `memberPermissions.${targetEmail.replace(/\./g, '__DOT__')}`;

    await memberRef.update({
      organizationIds: nextOrgIds,
      organizationId: nextOrgIds[0],
      accessMode,
      permissions: nextPermissions,
      orgPermissions: resolvedOrgPermissions,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const batch = adminDb.batch();
    // Remove access from unselected orgs
    for (const oldId of prevOrgIds) {
      if (!nextOrgIds.includes(oldId)) {
        const oldRef = adminDb.collection('organizations').doc(oldId);
        batch.update(oldRef, {
          memberEmails: FieldValue.arrayRemove(targetEmail),
          [permKey]: FieldValue.delete(),
        });
      }
    }
    // Grant/update access on selected orgs (unless suspended)
    if (data.status !== 'Suspended') {
      for (const orgDoc of nextOrgDocs) {
        batch.update(orgDoc.ref, {
          memberEmails: FieldValue.arrayUnion(targetEmail),
          [permKey]: resolvedOrgPermissions[orgDoc.id] || nextPermissions,
        });
      }
    }
    await batch.commit();

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update member access.' };
  }
}

/**
 * Permanently deletes a team member and revokes access across all allocated organizations.
 */
export async function deleteTeamMember(idToken: string, memberId: string) {
  try {
    const caller = await verifyCaller(idToken);
    const memberRef = adminDb.collection('teamMembers').doc(memberId);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) {
      return { success: false, error: 'Team member record not found.' };
    }

    const data = memberDoc.data()!;
    const orgIds: string[] = Array.isArray(data.organizationIds)
      ? data.organizationIds
      : data.organizationId
      ? [data.organizationId]
      : [];

    const orgDocs = await Promise.all(
      orgIds.map((id) => adminDb.collection('organizations').doc(id).get())
    );
    const canManage =
      data.ownerId === caller.uid ||
      orgDocs.some((docSnap) => docSnap.exists && callerHasOrgAdmin(docSnap.data(), caller));
    if (!canManage) {
      return { success: false, error: 'Only an organization owner or Admin can remove team members.' };
    }

    const targetEmail = (data.email || '').toLowerCase().trim();
    const permKey = `memberPermissions.${targetEmail.replace(/\./g, '__DOT__')}`;

    await memberRef.delete();

    const batch = adminDb.batch();
    for (const orgId of orgIds) {
      const orgRef = adminDb.collection('organizations').doc(orgId);
      batch.update(orgRef, {
        memberEmails: FieldValue.arrayRemove(targetEmail),
        [permKey]: FieldValue.delete(),
      });
    }
    await batch.commit();

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete team member.' };
  }
}

/**
 * Checks if the newly signed-up or signed-in user has pending/active team invitations.
 * Automatically activates pending invitations, allocates all invited organizations,
 * and returns whether the user is an invited member (so signup skips "Add First Organization").
 */
export async function checkAndClaimInvitations(idToken: string) {
  try {
    const caller = await verifyCaller(idToken);
    if (!caller.email) return { success: true, data: { hasInvitations: false, orgIds: [] as string[] } };

    const memberSnap = await adminDb
      .collection('teamMembers')
      .where('email', '==', caller.email)
      .get();

    if (memberSnap.empty) {
      return { success: true, data: { hasInvitations: false, orgIds: [] as string[] } };
    }

    const allocatedOrgIds: string[] = [];
    const batch = adminDb.batch();

    for (const docSnap of memberSnap.docs) {
      const d = docSnap.data();
      if (d.status === 'Suspended' || d.status === 'Inactive') continue;

      const orgIds: string[] = Array.isArray(d.organizationIds)
        ? d.organizationIds
        : d.organizationId
        ? [d.organizationId]
        : [];
      allocatedOrgIds.push(...orgIds);

      if (d.status === 'Pending' || !d.memberUid) {
        batch.update(docSnap.ref, {
          status: 'Active',
          memberUid: caller.uid,
          activatedAt: FieldValue.serverTimestamp(),
        });
      }

      const permKey = `memberPermissions.${caller.email.replace(/\./g, '__DOT__')}`;
      for (const orgId of orgIds) {
        const orgRef = adminDb.collection('organizations').doc(orgId);
        batch.update(orgRef, {
          memberEmails: FieldValue.arrayUnion(caller.email),
          ...(d.ownerName ? { ownerName: d.ownerName } : {}),
          ...(Array.isArray(d.permissions) ? { [permKey]: d.permissions } : {}),
        });
      }
    }

    await batch.commit();

    const uniqueOrgIds = Array.from(new Set(allocatedOrgIds));
    return {
      success: true,
      data: {
        hasInvitations: uniqueOrgIds.length > 0,
        orgIds: uniqueOrgIds,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to check invitations.' };
  }
}
