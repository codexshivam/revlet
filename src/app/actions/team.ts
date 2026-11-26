'use server';

import crypto from 'crypto';
import { adminAuth, adminDb } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ORG_ADMIN_PERMISSION, ADMIN_ALL_PERMISSIONS } from '@/lib/team-permissions';
import { verifyStepUpToken } from '@/lib/mfa';
import { getEnrolledFactorCounts } from '@/lib/mfa-store';
import { sendRevletAlertEmail } from '@/lib/revlet-alerts';

const PRIVILEGED_PERMISSIONS = new Set([
  ORG_ADMIN_PERMISSION,
  'DNS: Admin',
  'Email: Admin',
]);

function isPrivilegedGrant(perms: string[]): boolean {
  return perms.some((p) => PRIVILEGED_PERMISSIONS.has(p));
}

function hashInviteToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

function getInviteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://app.revlet.me').trim().replace(/\/$/, '');
}

async function verifyCaller(idToken: string) {
  if (!idToken) throw new Error('Unauthorized: Missing credentials.');
  const decoded = await adminAuth.verifyIdToken(idToken, true);
  return {
    uid: decoded.uid,
    email: (decoded.email || '').toLowerCase().trim(),
    emailVerified: decoded.email_verified === true,
    name: decoded.name || decoded.email || 'Organization Owner',
  };
}

/**
 * Verifies whether a UID is the organization owner OR holds an Active, UID-bound
 * teamMembers record with ORG_ADMIN_PERMISSION for this specific organization.
 */
async function uidHasOrgAdmin(orgId: string, orgData: any, uid: string): Promise<boolean> {
  if (!orgData || !uid) return false;
  if (orgData.ownerId === uid) return true;

  const snap = await adminDb
    .collection('teamMembers')
    .where('organizationIds', 'array-contains', orgId)
    .where('memberUid', '==', uid)
    .limit(5)
    .get();

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.status !== 'Active') continue;
    const perms: string[] = Array.isArray(d.orgPermissions?.[orgId])
      ? d.orgPermissions[orgId]
      : Array.isArray(d.permissions)
      ? d.permissions
      : [];
    if (perms.includes(ORG_ADMIN_PERMISSION)) {
      return true;
    }
  }
  return false;
}

async function callerHasOrgAdmin(
  orgId: string,
  orgData: any,
  caller: { uid: string; email: string; emailVerified: boolean }
): Promise<boolean> {
  if (!orgData) return false;
  if (orgData.ownerId === caller.uid) return true;
  if (!caller.emailVerified || !caller.email) return false;
  return uidHasOrgAdmin(orgId, orgData, caller.uid);
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
        if (data.status !== 'Pending Deletion' && (await callerHasOrgAdmin(doc.id, data, caller))) {
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
        const rawOrgIds: string[] = Array.isArray(data.organizationIds)
          ? data.organizationIds
          : data.organizationId
          ? [data.organizationId]
          : [];
        // Strictly scope returned orgs & permissions to organizations this caller can manage
        const visibleOrgIds = rawOrgIds.filter((oid) => manageableOrgIds.has(oid));
        if (visibleOrgIds.length === 0) continue;

        const scopedOrgPerms: Record<string, string[]> = {};
        for (const oid of visibleOrgIds) {
          if (Array.isArray(data.orgPermissions?.[oid])) {
            scopedOrgPerms[oid] = data.orgPermissions[oid];
          } else if (Array.isArray(data.permissions)) {
            scopedOrgPerms[oid] = data.permissions;
          }
        }
        const scopedFlatPerms = Array.from(new Set(Object.values(scopedOrgPerms).flat()));

        memberDocsMap.set(doc.id, {
          id: doc.id,
          email: data.email,
          organizationId: visibleOrgIds[0],
          organizationIds: visibleOrgIds,
          permissions: scopedFlatPerms,
          orgPermissions: scopedOrgPerms,
          accessMode: scopedFlatPerms.includes(ORG_ADMIN_PERMISSION) ? 'admin' : 'services',
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

    // Build normalized per-organization permissions map safely (prevents prototype/property injection)
    const resolvedOrgPermMap = new Map<string, string[]>();
    for (const oid of orgIds) {
      if (oid === '__proto__' || oid === 'constructor' || oid === 'prototype') continue;
      const rawPerms =
        params.orgPermissions && Object.prototype.hasOwnProperty.call(params.orgPermissions, oid)
          ? params.orgPermissions[oid]
          : fallbackPermissions;
      const isOrgAdmin = rawPerms.includes(ORG_ADMIN_PERMISSION);
      resolvedOrgPermMap.set(
        oid,
        isOrgAdmin
          ? [...ADMIN_ALL_PERMISSIONS]
          : Array.from(new Set(rawPerms.filter((p) => Boolean(p) && p !== ORG_ADMIN_PERMISSION)))
      );
    }
    const resolvedOrgPermissions: Record<string, string[]> = Object.fromEntries(resolvedOrgPermMap);
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
      if (!(await callerHasOrgAdmin(orgDoc.id, orgDoc.data(), caller))) {
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

    // Every invitation is created as an explicit Pending offer with an opaque token.
    // Never silently merge into or expand an existing Active membership.
    const initialStatus: 'Pending' = 'Pending';
    const rawToken = crypto.randomBytes(24).toString('base64url');
    const inviteTokenHash = hashInviteToken(rawToken);
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const inviteUrl = `${getInviteBaseUrl()}/invite/${rawToken}`;

    const createdRef = await adminDb.collection('teamMembers').add({
      email: targetEmail,
      organizationIds: orgIds,
      organizationId: orgIds[0],
      ownerId: caller.uid,
      ownerName: ownerDisplayName,
      invitedByUid: caller.uid,
      invitedBy: caller.email,
      accessMode,
      permissions,
      orgPermissions: resolvedOrgPermissions,
      status: initialStatus,
      inviteTokenHash,
      expiresAt,
      revoked: false,
      invitedAt: FieldValue.serverTimestamp(),
    });
    const memberId = createdRef.id;

    let emailSent = false;
    try {
      const orgNames = orgDocs
        .map((d) => String(d.data()?.name || d.data()?.domain || d.id))
        .join(', ');
      const mailRes = await sendRevletAlertEmail({
        to: targetEmail,
        subject: `You've been invited to join ${orgNames} on Revlet`,
        title: 'Workspace Invitation',
        subtitle: 'Join Workspace on Revlet',
        summaryLines: [
          `${ownerDisplayName} (${caller.email}) invited you to join ${orgNames} on Revlet.`,
          'Open the invitation link below to review the offered permissions and accept.',
        ],
        details: [
          { label: 'Workspaces', value: orgNames },
          { label: 'Invited By', value: caller.email },
          { label: 'Access Mode', value: accessMode === 'admin' ? 'Administrator' : 'Scoped Services' },
          { label: 'Expires In', value: '7 days' },
        ],
        ctaUrl: inviteUrl,
        ctaLabel: 'Review & Accept Invitation',
      });
      emailSent = Boolean(mailRes);
    } catch {
      emailSent = false;
    }

    return {
      success: true,
      data: {
        id: memberId,
        email: targetEmail,
        status: initialStatus,
        organizationIds: orgIds,
        permissions,
        inviteUrl,
        emailSent,
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
    const adminChecks = await Promise.all(
      orgDocs.map((docSnap) =>
        docSnap.exists ? callerHasOrgAdmin(docSnap.id, docSnap.data(), caller) : Promise.resolve(false)
      )
    );
    const canManage =
      data.ownerId === caller.uid ||
      (orgDocs.length > 0 && adminChecks.every(Boolean));
    if (!canManage) {
      return { success: false, error: 'Only an organization owner or Admin of all assigned organizations can modify team member status.' };
    }

    const targetEmail = (data.email || '').toLowerCase().trim();

    // If reactivating a user who never accepted/bound a UID, keep as Pending
    const resolvedStatus: 'Active' | 'Pending' | 'Suspended' =
      newStatus === 'Active' && !data.memberUid ? 'Pending' : newStatus;

    await memberRef.update({
      status: resolvedStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const batch = adminDb.batch();
    for (const orgId of orgIds) {
      const orgRef = adminDb.collection('organizations').doc(orgId);
      if (resolvedStatus === 'Suspended' || resolvedStatus === 'Pending') {
        batch.update(orgRef, {
          memberEmails: FieldValue.arrayRemove(targetEmail),
          ...(data.memberUid ? { memberIds: FieldValue.arrayRemove(data.memberUid) } : {}),
        });
      } else {
        batch.update(orgRef, {
          memberEmails: FieldValue.arrayUnion(targetEmail),
          ...(data.memberUid ? { memberIds: FieldValue.arrayUnion(data.memberUid) } : {}),
          [`memberPermissions.${targetEmail.replace(/\./g, '__DOT__')}`]:
            data.orgPermissions?.[orgId] || data.permissions || [],
        });
      }
    }
    await batch.commit();

    if (targetEmail) {
      try {
        const orgNames = orgDocs
          .filter((d) => d.exists)
          .map((d) => String(d.data()?.name || d.data()?.domain || d.id))
          .join(', ') || 'Revlet Workspace';
        const isSuspended = resolvedStatus === 'Suspended';
        await sendRevletAlertEmail({
          to: targetEmail,
          subject: `Your Revlet workspace access has been ${isSuspended ? 'suspended' : 'restored'}`,
          title: isSuspended ? 'Team Access Suspended' : 'Team Access Restored',
          subtitle: 'Workspace Access & Security',
          summaryLines: [
            isSuspended
              ? `Your access to ${orgNames} has been suspended by an organization administrator.`
              : `Your access to ${orgNames} has been restored.`,
          ],
          details: [
            { label: 'Organizations', value: orgNames },
            { label: 'Status', value: resolvedStatus },
            { label: 'Updated By', value: caller.email || caller.name },
          ],
          ctaUrl: 'https://app.revlet.me/account/home',
          ctaLabel: 'Open Revlet Console',
        });
      } catch {
        // Non-blocking status notification
      }
    }

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

    const resolvedOrgPermMap = new Map<string, string[]>();
    for (const oid of nextOrgIds) {
      if (oid === '__proto__' || oid === 'constructor' || oid === 'prototype') continue;
      const rawPerms =
        params.orgPermissions && Object.prototype.hasOwnProperty.call(params.orgPermissions, oid)
          ? params.orgPermissions[oid]
          : fallbackPermissions;
      const isOrgAdmin = rawPerms.includes(ORG_ADMIN_PERMISSION);
      resolvedOrgPermMap.set(
        oid,
        isOrgAdmin
          ? [...ADMIN_ALL_PERMISSIONS]
          : Array.from(new Set(rawPerms.filter((p) => Boolean(p) && p !== ORG_ADMIN_PERMISSION)))
      );
    }
    const resolvedOrgPermissions: Record<string, string[]> = Object.fromEntries(resolvedOrgPermMap);
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

    // Authorize EVERY added, kept, AND removed organization before modifying grants
    const removedOrgIds = prevOrgIds.filter((oid) => !nextOrgIds.includes(oid));
    const allAffectedOrgIds = Array.from(new Set([...nextOrgIds, ...removedOrgIds]));
    const allAffectedOrgDocs = await Promise.all(
      allAffectedOrgIds.map((id) => adminDb.collection('organizations').doc(id).get())
    );
    const affectedOrgMap = new Map(allAffectedOrgDocs.map((d) => [d.id, d]));

    for (const docSnap of allAffectedOrgDocs) {
      if (!docSnap.exists) {
        if (nextOrgIds.includes(docSnap.id)) {
          return { success: false, error: 'One or more selected organizations no longer exist.' };
        }
        continue;
      }
      if (!(await callerHasOrgAdmin(docSnap.id, docSnap.data(), caller))) {
        return {
          success: false,
          error: 'Only an organization owner or Admin can modify or revoke access for each affected organization.',
        };
      }
    }

    const nextOrgDocs = nextOrgIds
      .map((id) => affectedOrgMap.get(id))
      .filter((d): d is FirebaseFirestore.DocumentSnapshot => Boolean(d && d.exists));

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

    // Only sync organization-level membership indexes for ACTIVE, UID-bound members.
    // Editing a Pending invite updates ONLY the pending offer, never granting org visibility.
    if (data.status === 'Active' && data.memberUid) {
      const batch = adminDb.batch();
      for (const oldId of removedOrgIds) {
        const oldDoc = affectedOrgMap.get(oldId);
        if (oldDoc?.exists) {
          batch.update(oldDoc.ref, {
            memberIds: FieldValue.arrayRemove(data.memberUid),
            memberEmails: FieldValue.arrayRemove(targetEmail),
            [permKey]: FieldValue.delete(),
          });
        }
      }
      for (const orgDoc of nextOrgDocs) {
        batch.update(orgDoc.ref, {
          memberIds: FieldValue.arrayUnion(data.memberUid),
          memberEmails: FieldValue.arrayUnion(targetEmail),
          [permKey]: resolvedOrgPermissions[orgDoc.id] || nextPermissions,
        });
      }
      await batch.commit();
    }

    if (targetEmail) {
      try {
        const orgNames = nextOrgDocs
          .filter((d) => d.exists)
          .map((d) => String(d.data()?.name || d.data()?.domain || d.id))
          .join(', ');
        await sendRevletAlertEmail({
          to: targetEmail,
          subject: 'Your Revlet workspace permissions have been updated',
          title: 'Workspace Access Updated',
          subtitle: 'Team Permissions & Access',
          summaryLines: [
            'An administrator updated your organization assignments and permissions on Revlet.',
          ],
          details: [
            { label: 'Organizations', value: orgNames || 'Assigned Workspaces' },
            { label: 'Access Mode', value: accessMode === 'admin' ? 'Administrator' : 'Scoped Services' },
            { label: 'Updated By', value: caller.email || caller.name },
          ],
          ctaUrl: 'https://app.revlet.me/account/home',
          ctaLabel: 'View Workspaces',
        });
      } catch {
        // Non-blocking access update email
      }
    }

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
    const delAdminChecks = await Promise.all(
      orgDocs.map((docSnap) =>
        docSnap.exists ? callerHasOrgAdmin(docSnap.id, docSnap.data(), caller) : Promise.resolve(false)
      )
    );
    const canManage =
      data.ownerId === caller.uid ||
      (orgDocs.length > 0 && delAdminChecks.every(Boolean));
    if (!canManage) {
      return { success: false, error: 'Only an organization owner or Admin of all assigned organizations can remove team members.' };
    }

    const targetEmail = (data.email || '').toLowerCase().trim();
    const permKey = `memberPermissions.${targetEmail.replace(/\./g, '__DOT__')}`;

    await memberRef.delete();

    const batch = adminDb.batch();
    for (const orgId of orgIds) {
      const orgRef = adminDb.collection('organizations').doc(orgId);
      batch.update(orgRef, {
        memberEmails: FieldValue.arrayRemove(targetEmail),
        ...(data.memberUid ? { memberIds: FieldValue.arrayRemove(data.memberUid) } : {}),
        [permKey]: FieldValue.delete(),
      });
    }
    await batch.commit();

    if (targetEmail) {
      try {
        const orgNames = orgDocs
          .filter((d) => d.exists)
          .map((d) => String(d.data()?.name || d.data()?.domain || d.id))
          .join(', ') || 'Revlet Workspace';
        await sendRevletAlertEmail({
          to: targetEmail,
          subject: 'Your Revlet workspace access has been revoked',
          title: 'Workspace Access Revoked',
          subtitle: 'Team Access & Security',
          summaryLines: [
            `Your team access to ${orgNames} has been removed by an organization administrator.`,
          ],
          details: [
            { label: 'Organizations', value: orgNames },
            { label: 'Actioned By', value: caller.email || caller.name },
          ],
          ctaUrl: 'https://app.revlet.me/support',
          ctaLabel: 'Contact Support',
        });
      } catch {
        // Non-blocking revocation email
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete team member.' };
  }
}

/**
 * Rotates an invitation's opaque token and resends the invitation email.
 */
export async function resendTeamInvitation(idToken: string, memberId: string) {
  try {
    const caller = await verifyCaller(idToken);
    const memberRef = adminDb.collection('teamMembers').doc(memberId);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      return { success: false, error: 'Invitation not found.' };
    }
    const data = memberSnap.data()!;
    if (data.status !== 'Pending') {
      return { success: false, error: 'Only pending invitations can be resent.' };
    }
    const orgIds: string[] = Array.isArray(data.organizationIds)
      ? data.organizationIds
      : data.organizationId
      ? [data.organizationId]
      : [];
    const orgDocs = await Promise.all(
      orgIds.map((id) => adminDb.collection('organizations').doc(id).get())
    );
    for (const docSnap of orgDocs) {
      if (!docSnap.exists || !(await callerHasOrgAdmin(docSnap.id, docSnap.data(), caller))) {
        return { success: false, error: 'Unauthorized to resend this invitation.' };
      }
    }

    const rawToken = crypto.randomBytes(24).toString('base64url');
    const inviteTokenHash = hashInviteToken(rawToken);
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const inviteUrl = `${getInviteBaseUrl()}/invite/${rawToken}`;

    await memberRef.update({
      inviteTokenHash,
      expiresAt,
      revoked: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    let emailSent = false;
    try {
      const orgNames = orgDocs
        .map((d) => String(d.data()?.name || d.data()?.domain || d.id))
        .join(', ');
      const mailRes = await sendRevletAlertEmail({
        to: data.email,
        subject: `Reminder: You've been invited to join ${orgNames} on Revlet`,
        title: 'Workspace Invitation Reminder',
        subtitle: 'Join Workspace on Revlet',
        summaryLines: [
          `${data.ownerName || caller.name} (${caller.email}) invited you to join ${orgNames} on Revlet.`,
          'Open the link below to review and accept your workspace invitation.',
        ],
        details: [
          { label: 'Workspaces', value: orgNames },
          { label: 'Invited By', value: caller.email },
          { label: 'Expires In', value: '7 days' },
        ],
        ctaUrl: inviteUrl,
        ctaLabel: 'Review & Accept Invitation',
      });
      emailSent = Boolean(mailRes);
    } catch {
      emailSent = false;
    }

    return { success: true, data: { inviteUrl, emailSent } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to resend invitation.' };
  }
}

/**
 * Read-only lookup of a specific opaque invitation token for the /invite/[token] Join Workspace page.
 */
export async function getInvitationByToken(rawToken: string) {
  try {
    if (!rawToken || rawToken.trim().length < 16) {
      return { success: true, data: { state: 'not_found' as const } };
    }
    const tokenHash = hashInviteToken(rawToken);
    const snap = await adminDb
      .collection('teamMembers')
      .where('inviteTokenHash', '==', tokenHash)
      .limit(1)
      .get();

    if (snap.empty) {
      return { success: true, data: { state: 'not_found' as const } };
    }

    const doc = snap.docs[0];
    const d = doc.data();
    if (d.revoked === true || d.status === 'Suspended' || d.status === 'Inactive') {
      return { success: true, data: { state: 'revoked' as const } };
    }
    if (d.status === 'Active') {
      const orgId = d.organizationId || (Array.isArray(d.organizationIds) ? d.organizationIds[0] : undefined);
      const perms: string[] = Array.isArray(d.orgPermissions?.[orgId])
        ? d.orgPermissions[orgId]
        : Array.isArray(d.permissions)
        ? d.permissions
        : [];
      return {
        success: true,
        data: {
          state: 'accepted' as const,
          orgId,
          primaryPerms: perms,
          email: String(d.email || '').toLowerCase().trim(),
        },
      };
    }
    if (typeof d.expiresAt === 'number' && d.expiresAt < Date.now()) {
      return { success: true, data: { state: 'expired' as const } };
    }

    const orgIds: string[] = Array.isArray(d.organizationIds)
      ? d.organizationIds
      : d.organizationId
      ? [d.organizationId]
      : [];
    const orgDocs = await Promise.all(
      orgIds.map((id) => adminDb.collection('organizations').doc(id).get())
    );
    const orgs = orgDocs
      .filter((o) => o.exists)
      .map((o) => ({
        id: o.id,
        name: String(o.data()?.name || o.data()?.domain || o.id),
        domain: String(o.data()?.domain || ''),
        permissions: Array.isArray(d.orgPermissions?.[o.id])
          ? (d.orgPermissions[o.id] as string[])
          : Array.isArray(d.permissions)
          ? (d.permissions as string[])
          : [],
      }));

    if (orgs.length === 0) {
      return { success: true, data: { state: 'revoked' as const } };
    }

    const isPrivileged = orgs.some((o) => isPrivilegedGrant(o.permissions));

    return {
      success: true,
      data: {
        state: 'valid' as const,
        inviteId: doc.id,
        email: String(d.email || '').toLowerCase().trim(),
        inviterName: String(d.ownerName || d.invitedBy || 'Workspace Admin'),
        inviterEmail: String(d.invitedBy || ''),
        isPrivileged,
        orgs,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Could not load invitation details.' };
  }
}

/**
 * Explicitly accepts a specific invitation token in a transaction.
 * Requires a revocation-checked verified email matching the invitation and
 * validates the inviter's current authority (owner OR delegated Org Admin) for each org.
 */
export async function acceptInvitationByToken(
  idToken: string,
  rawToken: string,
  stepUpToken?: string
) {
  try {
    const caller = await verifyCaller(idToken);
    if (!caller.email || !caller.emailVerified) {
      return {
        success: false,
        error: 'Please verify your email address before accepting this workspace invitation.',
      };
    }
    if (!rawToken || rawToken.trim().length < 16) {
      return { success: false, error: 'Invalid invitation link.' };
    }

    const tokenHash = hashInviteToken(rawToken);
    const snap = await adminDb
      .collection('teamMembers')
      .where('inviteTokenHash', '==', tokenHash)
      .limit(1)
      .get();

    if (snap.empty) {
      return { success: false, error: 'This invitation link is invalid or has expired.' };
    }

    const inviteRef = snap.docs[0].ref;
    const preData = snap.docs[0].data();

    if ((preData.email || '').toLowerCase().trim() !== caller.email) {
      return {
        success: false,
        error: `This invitation was sent to ${preData.email}. Sign in with that address to accept.`,
      };
    }

    const candidateOrgIds: string[] = Array.isArray(preData.organizationIds)
      ? preData.organizationIds
      : preData.organizationId
      ? [preData.organizationId]
      : [];

    // Already accepted by this user: idempotently reopen the workspace
    if (preData.status === 'Active' && preData.memberUid === caller.uid) {
      const primaryOrgId = candidateOrgIds[0];
      const primaryPerms: string[] = Array.isArray(preData.orgPermissions?.[primaryOrgId])
        ? preData.orgPermissions[primaryOrgId]
        : Array.isArray(preData.permissions)
        ? preData.permissions
        : [];
      return {
        success: true,
        data: { orgIds: candidateOrgIds, primaryOrgId, primaryPerms, alreadyAccepted: true },
      };
    }

    // Pre-fetch enrolled MFA factor counts and inviter team-membership docs so
    // all authorization, token, role, and MFA checks execute atomically inside
    // the acceptance transaction against fresh state.
    const mfaCounts = await getEnrolledFactorCounts(caller.uid);
    const preInviterUid = String(preData.invitedByUid || preData.ownerId || '');
    const inviterMembershipSnap = preInviterUid
      ? await adminDb
          .collection('teamMembers')
          .where('memberUid', '==', preInviterUid)
          .limit(20)
          .get()
      : null;
    const inviterMembershipRefs = inviterMembershipSnap ? inviterMembershipSnap.docs.map((d) => d.ref) : [];

    const txResult = await adminDb.runTransaction(async (tx) => {
      const freshSnap = await tx.get(inviteRef);
      if (!freshSnap.exists) throw new Error('Invitation no longer exists.');
      const d = freshSnap.data() || {};

      if (d.inviteTokenHash !== tokenHash) {
        throw new Error('This invitation link has been superseded. Use the latest invitation email.');
      }
      if (d.revoked === true || d.status === 'Suspended' || d.status === 'Inactive') {
        throw new Error('This invitation has been revoked.');
      }
      if (typeof d.expiresAt === 'number' && d.expiresAt < Date.now()) {
        throw new Error('This invitation has expired. Ask your admin to resend it.');
      }
      if ((d.email || '').toLowerCase().trim() !== caller.email) {
        throw new Error('Signed-in email does not match this invitation.');
      }

      const freshOrgIds: string[] = Array.isArray(d.organizationIds)
        ? d.organizationIds
        : d.organizationId
        ? [d.organizationId]
        : [];
      if (freshOrgIds.length === 0) {
        throw new Error('Invitation has no target workspaces.');
      }

      if (d.status === 'Active') {
        if (d.memberUid && d.memberUid !== caller.uid) {
          throw new Error('This invitation was already claimed by another account.');
        }
        const primaryOrgId = freshOrgIds[0];
        const primaryPerms: string[] = Array.isArray(d.orgPermissions?.[primaryOrgId])
          ? d.orgPermissions[primaryOrgId]
          : Array.isArray(d.permissions)
          ? d.permissions
          : [];
        return { orgIds: freshOrgIds, primaryOrgId, primaryPerms, alreadyAccepted: true };
      }

      // Enforce MFA on the freshly read offered permissions inside the transaction.
      // Privileged invitees with zero enrolled factors must enroll MFA first.
      const freshOfferedPerms = Array.from(
        new Set(
          freshOrgIds.flatMap((oid) =>
            Array.isArray(d.orgPermissions?.[oid])
              ? (d.orgPermissions[oid] as string[])
              : Array.isArray(d.permissions)
              ? (d.permissions as string[])
              : []
          )
        )
      );
      if (isPrivilegedGrant(freshOfferedPerms)) {
        if (mfaCounts.totalFactors === 0) {
          throw new Error(
            'MFA_ENROLLMENT_REQUIRED: Enable 2-Step Verification in Account Settings before accepting a privileged workspace role.'
          );
        }
        if (!verifyStepUpToken(stepUpToken, caller.uid)) {
          throw new Error(
            'MFA_STEP_UP_REQUIRED: Complete 2-Step Verification to accept this privileged role.'
          );
        }
      }

      // Re-read org docs and inviter membership docs inside the transaction to
      // verify inviter authority atomically at the point of acceptance.
      const inviterUid = String(d.invitedByUid || d.ownerId || '');
      const orgRefs = freshOrgIds.map((oid) => adminDb.collection('organizations').doc(oid));
      const [orgSnaps, freshInviterSnaps] = await Promise.all([
        Promise.all(orgRefs.map((ref) => tx.get(ref))),
        inviterUid && inviterUid === preInviterUid
          ? Promise.all(inviterMembershipRefs.map((ref) => tx.get(ref)))
          : Promise.resolve([]),
      ]);

      const authorizedOrgIds: string[] = [];
      for (let i = 0; i < freshOrgIds.length; i++) {
        const oid = freshOrgIds[i];
        const orgSnap = orgSnaps[i];
        if (!orgSnap.exists) continue;
        const orgData = orgSnap.data() || {};
        let inviterAuthorized = Boolean(inviterUid && orgData.ownerId === inviterUid);
        if (!inviterAuthorized && inviterUid) {
          for (const mSnap of freshInviterSnaps) {
            if (!mSnap.exists) continue;
            const md = mSnap.data() || {};
            if (md.status !== 'Active' || md.memberUid !== inviterUid) continue;
            const mOrgs: string[] = Array.isArray(md.organizationIds) ? md.organizationIds : [];
            if (!mOrgs.includes(oid)) continue;
            const mPerms: string[] = Array.isArray(md.orgPermissions?.[oid])
              ? md.orgPermissions[oid]
              : Array.isArray(md.permissions)
              ? md.permissions
              : [];
            if (mPerms.includes(ORG_ADMIN_PERMISSION)) {
              inviterAuthorized = true;
              break;
            }
          }
        }
        if (inviterAuthorized) {
          authorizedOrgIds.push(oid);
        }
      }

      if (authorizedOrgIds.length === 0) {
        throw new Error('The inviter no longer has permission to grant access to this workspace.');
      }

      // Keep inviteTokenHash on Active record so retrying the same link cleanly reopens the workspace
      tx.update(inviteRef, {
        status: 'Active',
        memberUid: caller.uid,
        organizationIds: authorizedOrgIds,
        organizationId: authorizedOrgIds[0],
        activatedAt: FieldValue.serverTimestamp(),
        acceptedAt: FieldValue.serverTimestamp(),
      });

      const permKey = `memberPermissions.${caller.email.replace(/\./g, '__DOT__')}`;
      for (const orgId of authorizedOrgIds) {
        const orgRef = adminDb.collection('organizations').doc(orgId);
        const orgPerms = Array.isArray(d.orgPermissions?.[orgId])
          ? d.orgPermissions[orgId]
          : Array.isArray(d.permissions)
          ? d.permissions
          : [];
        tx.update(orgRef, {
          memberIds: FieldValue.arrayUnion(caller.uid),
          memberEmails: FieldValue.arrayUnion(caller.email),
          ...(orgPerms.length > 0 ? { [permKey]: orgPerms } : {}),
        });
      }

      const primaryOrgId = authorizedOrgIds[0];
      const primaryPerms: string[] = Array.isArray(d.orgPermissions?.[primaryOrgId])
        ? d.orgPermissions[primaryOrgId]
        : Array.isArray(d.permissions)
        ? d.permissions
        : [];

      return { orgIds: authorizedOrgIds, primaryOrgId, primaryPerms, alreadyAccepted: false };
    });

    const { orgIds: acceptedOrgIds, primaryOrgId, primaryPerms } = txResult;

    return {
      success: true,
      data: {
        orgIds: acceptedOrgIds,
        primaryOrgId,
        primaryPerms,
        alreadyAccepted: false,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Could not accept invitation.' };
  }
}

/**
 * Lists all valid Pending invitations for the signed-in verified user so Account Home
 * can display a Pending Invitations banner with individual Join or deliberate Join All.
 */
export async function listMyPendingInvitations(idToken: string) {
  try {
    const caller = await verifyCaller(idToken);
    if (!caller.email || !caller.emailVerified) {
      return { success: true, data: [] as Array<any> };
    }
    const snap = await adminDb
      .collection('teamMembers')
      .where('email', '==', caller.email)
      .where('status', '==', 'Pending')
      .limit(20)
      .get();

    const now = Date.now();
    const results: Array<{
      id: string;
      inviterName: string;
      isPrivileged: boolean;
      orgs: Array<{ id: string; name: string; domain: string; permissions: string[] }>;
    }> = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.revoked === true) continue;
      if (typeof d.expiresAt === 'number' && d.expiresAt < now) continue;

      const orgIds: string[] = Array.isArray(d.organizationIds)
        ? d.organizationIds
        : d.organizationId
        ? [d.organizationId]
        : [];
      const orgDocs = await Promise.all(
        orgIds.map((oid) => adminDb.collection('organizations').doc(oid).get())
      );
      const orgs = orgDocs
        .filter((o) => o.exists)
        .map((o) => ({
          id: o.id,
          name: String(o.data()?.name || o.data()?.domain || o.id),
          domain: String(o.data()?.domain || ''),
          permissions: Array.isArray(d.orgPermissions?.[o.id])
            ? (d.orgPermissions[o.id] as string[])
            : Array.isArray(d.permissions)
            ? (d.permissions as string[])
            : [],
        }));
      if (orgs.length === 0) continue;

      results.push({
        id: doc.id,
        inviterName: String(d.ownerName || d.invitedBy || 'Workspace Admin'),
        isPrivileged: orgs.some((o) => isPrivilegedGrant(o.permissions)),
        orgs,
      });
    }

    return { success: true, data: results };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Could not load pending invitations.' };
  }
}

/**
 * Deliberately accepts one or all pending invitations for the signed-in verified user
 * (supports individual Join or Join All from Account Home).
 */
export async function acceptPendingInvitations(
  idToken: string,
  inviteIds?: string[],
  stepUpToken?: string
) {
  try {
    const caller = await verifyCaller(idToken);
    if (!caller.email || !caller.emailVerified) {
      return { success: false, error: 'Email verification is required before joining workspaces.' };
    }

    const snap = await adminDb
      .collection('teamMembers')
      .where('email', '==', caller.email)
      .where('status', '==', 'Pending')
      .limit(20)
      .get();

    const targetDocs = snap.docs.filter((doc) => {
      const d = doc.data();
      if (d.revoked === true) return false;
      if (typeof d.expiresAt === 'number' && d.expiresAt < Date.now()) return false;
      if (inviteIds && inviteIds.length > 0 && !inviteIds.includes(doc.id)) return false;
      return true;
    });

    if (targetDocs.length === 0) {
      return { success: false, error: 'No pending invitations available to accept.' };
    }

    // Require fresh MFA step-up if any selected invitation grants a privileged role
    const anyPrivileged = targetDocs.some((doc) => {
      const d = doc.data();
      const flatPerms: string[] = Array.isArray(d.permissions) ? d.permissions : [];
      return isPrivilegedGrant(flatPerms);
    });
    if (anyPrivileged) {
      const mfaCounts = await getEnrolledFactorCounts(caller.uid);
      if (mfaCounts.totalFactors > 0 && !verifyStepUpToken(stepUpToken, caller.uid)) {
        return {
          success: false,
          error: 'MFA_STEP_UP_REQUIRED: Complete 2-Step Verification to accept privileged workspace access.',
        };
      }
    }

    const joinedOrgIds: string[] = [];
    let firstPerms: string[] = [];

    for (const docSnap of targetDocs) {
      const preData = docSnap.data();
      const inviterUid = String(preData.invitedByUid || preData.ownerId || '');
      const candidateOrgIds: string[] = Array.isArray(preData.organizationIds)
        ? preData.organizationIds
        : preData.organizationId
        ? [preData.organizationId]
        : [];

      const authorizedOrgIds: string[] = [];
      for (const orgId of candidateOrgIds) {
        const orgSnap = await adminDb.collection('organizations').doc(orgId).get();
        if (!orgSnap.exists) continue;
        if (await uidHasOrgAdmin(orgId, orgSnap.data(), inviterUid)) {
          authorizedOrgIds.push(orgId);
        }
      }
      if (authorizedOrgIds.length === 0) continue;

      const claimed = await adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(docSnap.ref);
        if (!fresh.exists) return [] as string[];
        const d = fresh.data() || {};
        if (d.status !== 'Pending' || d.revoked === true) return [] as string[];
        if ((d.email || '').toLowerCase().trim() !== caller.email) return [] as string[];

        tx.update(docSnap.ref, {
          status: 'Active',
          memberUid: caller.uid,
          organizationIds: authorizedOrgIds,
          organizationId: authorizedOrgIds[0],
          activatedAt: FieldValue.serverTimestamp(),
          acceptedAt: FieldValue.serverTimestamp(),
        });

        const permKey = `memberPermissions.${caller.email.replace(/\./g, '__DOT__')}`;
        for (const orgId of authorizedOrgIds) {
          const orgRef = adminDb.collection('organizations').doc(orgId);
          const orgPerms = Array.isArray(d.orgPermissions?.[orgId])
            ? d.orgPermissions[orgId]
            : Array.isArray(d.permissions)
            ? d.permissions
            : [];
          tx.update(orgRef, {
            memberIds: FieldValue.arrayUnion(caller.uid),
            memberEmails: FieldValue.arrayUnion(caller.email),
            ...(orgPerms.length > 0 ? { [permKey]: orgPerms } : {}),
          });
        }
        return authorizedOrgIds;
      });

      if (claimed.length > 0) {
        if (firstPerms.length === 0) {
          firstPerms = Array.isArray(preData.orgPermissions?.[claimed[0]])
            ? preData.orgPermissions[claimed[0]]
            : Array.isArray(preData.permissions)
            ? preData.permissions
            : [];
        }
        joinedOrgIds.push(...claimed);
      }
    }

    const uniqueOrgIds = Array.from(new Set(joinedOrgIds));
    if (uniqueOrgIds.length === 0) {
      return { success: false, error: 'None of the selected invitations could be accepted.' };
    }

    return {
      success: true,
      data: {
        orgIds: uniqueOrgIds,
        primaryOrgId: uniqueOrgIds[0],
        primaryPerms: firstPerms,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to accept pending invitations.' };
  }
}

/**
 * Read-only check for pending invitations (replaces silent background auto-claim).
 */
export async function checkAndClaimInvitations(idToken: string) {
  try {
    const caller = await verifyCaller(idToken);
    if (!caller.email || !caller.emailVerified) {
      return { success: true, data: { hasInvitations: false, orgIds: [] as string[] } };
    }
    const snap = await adminDb
      .collection('teamMembers')
      .where('email', '==', caller.email)
      .where('status', '==', 'Pending')
      .limit(10)
      .get();

    const pendingOrgIds = snap.docs.flatMap((d) => {
      const data = d.data();
      return Array.isArray(data.organizationIds)
        ? data.organizationIds
        : data.organizationId
        ? [data.organizationId]
        : [];
    });

    return {
      success: true,
      data: {
        hasInvitations: pendingOrgIds.length > 0,
        orgIds: Array.from(new Set(pendingOrgIds)),
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to check invitations.' };
  }
}
