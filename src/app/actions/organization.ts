'use server';

import { verifyUserOrgAccess } from './auth-helper';
import { adminDb } from '@/firebase/admin';
import { ORG_ADMIN_PERMISSION } from '@/lib/team-permissions';
import { callStalwartJmap, dispatchStalwartApi } from '@/lib/mail-internal';
import {
  resolveOrganizationOwnerEmail,
  sendRevletAlertEmail,
} from '@/lib/revlet-alerts';

export async function deleteOrganization(idToken: string, orgId: string) {
  if (!idToken || !orgId) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const authResult = await verifyUserOrgAccess(idToken, orgId);
    if (!authResult.isOwner) {
      return { success: false, error: 'Unauthorized: Only the organization owner can delete this organization.' };
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    const orgData = orgSnap.data() || {};
    const orgName = String(orgData.name || orgData.domain || orgId);
    const orgDomain = String(orgData.domain || 'N/A');
    const ownerEmail =
      (authResult.email ? authResult.email.toLowerCase().trim() : null) ||
      (await resolveOrganizationOwnerEmail(orgData));

    const domain = String(orgData.domain || '').toLowerCase().trim();

    // 1. Query associated team members and all subcollections
    const [
      membersLegacySnap,
      membersArraySnap,
      mailUsersSnap,
      mailGroupsSnap,
      mailOusSnap,
      mailLogsSnap,
      dnsSnapshotsSnap,
      secretsSnap,
      snsEventsSnap,
    ] = await Promise.all([
      adminDb.collection('teamMembers').where('organizationId', '==', orgId).get(),
      adminDb.collection('teamMembers').where('organizationIds', 'array-contains', orgId).get(),
      orgRef.collection('mailUsers').get(),
      orgRef.collection('mailGroups').get(),
      orgRef.collection('mailOrgUnits').get(),
      orgRef.collection('mailAuditLogs').get(),
      orgRef.collection('dns_snapshots').get(),
      orgRef.collection('secrets').get(),
      orgRef.collection('snsProcessedEvents').get(),
    ]);

    // 2. Deprovision Stalwart principals, mailing lists, and domain (best-effort)
    for (const uDoc of mailUsersSnap.docs) {
      const primaryEmail = (uDoc.data().primaryEmail || '').toLowerCase().trim();
      if (primaryEmail) {
        await dispatchStalwartApi('DELETE', `/api/principal/${encodeURIComponent(primaryEmail)}`).catch(() => null);
      }
    }
    if (domain) {
      try {
        const mlRes = await callStalwartJmap([
          ['x:MailingList/get', { accountId: 'b', ids: null }, 'mlList'],
        ]);
        const mlList: any[] = mlRes.find((r) => r[0] === 'x:MailingList/get')?.[1]?.list || [];
        const domainMls = mlList
          .filter((m) => (m.emailAddress || '').toLowerCase().endsWith(`@${domain}`))
          .map((m) => m.id)
          .filter(Boolean);
        if (domainMls.length > 0) {
          await callStalwartJmap([
            ['x:MailingList/set', { accountId: 'b', destroy: domainMls }, 'delMls'],
          ]);
        }
        const domRes = await callStalwartJmap([
          ['x:Domain/get', { accountId: 'b', ids: null }, 'domList'],
        ]);
        const domList: any[] = domRes.find((r) => r[0] === 'x:Domain/get')?.[1]?.list || [];
        const matchedDom = domList.find((d) => (d.name || '').toLowerCase() === domain);
        if (matchedDom?.id) {
          await callStalwartJmap([
            ['x:Domain/set', { accountId: 'b', destroy: [matchedDom.id] }, 'delDom'],
          ]);
        }
      } catch (stalwartErr) {
        console.warn('[Org Delete] Stalwart domain cleanup warning:', stalwartErr);
      }
    }

    // 3. Collect all Firestore batch operations (preserving multi-org teamMembers)
    const ops: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];

    const seenMemberDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const d of [...membersLegacySnap.docs, ...membersArraySnap.docs]) {
      seenMemberDocs.set(d.id, d);
    }
    for (const memberDoc of seenMemberDocs.values()) {
      const mData = memberDoc.data();
      const currentOrgIds: string[] = Array.isArray(mData.organizationIds)
        ? mData.organizationIds
        : mData.organizationId
        ? [mData.organizationId]
        : [];
      const remainingOrgIds = currentOrgIds.filter((id) => id !== orgId);
      if (remainingOrgIds.length === 0) {
        ops.push((b) => b.delete(memberDoc.ref));
      } else {
        const rawOrgPerms =
          mData.orgPermissions && typeof mData.orgPermissions === 'object'
            ? (mData.orgPermissions as Record<string, string[]>)
            : {};
        const nextOrgPermissions: Record<string, string[]> = Object.fromEntries(
          Object.entries(rawOrgPerms).filter(
            ([k]) => k !== orgId && k !== '__proto__' && k !== 'constructor' && k !== 'prototype'
          )
        );
        const nextFlatPerms = Array.from(new Set(Object.values(nextOrgPermissions).flat()));
        const nextAccessMode = nextFlatPerms.includes(ORG_ADMIN_PERMISSION) ? 'admin' : 'services';
        ops.push((b) =>
          b.update(memberDoc.ref, {
            organizationIds: remainingOrgIds,
            organizationId: remainingOrgIds[0],
            orgPermissions: nextOrgPermissions,
            permissions: nextFlatPerms,
            accessMode: nextAccessMode,
          })
        );
      }
    }

    const subRefs = [
      ...mailUsersSnap.docs.map((d) => d.ref),
      ...mailGroupsSnap.docs.map((d) => d.ref),
      ...mailOusSnap.docs.map((d) => d.ref),
      ...mailLogsSnap.docs.map((d) => d.ref),
      ...dnsSnapshotsSnap.docs.map((d) => d.ref),
      ...secretsSnap.docs.map((d) => d.ref),
      ...snsEventsSnap.docs.map((d) => d.ref),
    ];
    for (const ref of subRefs) {
      ops.push((b) => b.delete(ref));
    }

    // Delete the organization document itself
    ops.push((b) => b.delete(orgRef));

    // Commit in <= 400-operation chunks to stay well under Firestore's 500-op batch limit
    for (let i = 0; i < ops.length; i += 400) {
      const batch = adminDb.batch();
      for (const applyOp of ops.slice(i, i + 400)) {
        applyOp(batch);
      }
      await batch.commit();
    }

    if (ownerEmail) {
      try {
        await sendRevletAlertEmail({
          to: ownerEmail,
          subject: `[Revlet] Organization Deleted: ${orgName}`,
          title: 'Organization Deleted',
          subtitle: 'Account & Organization Activity',
          summaryLines: [
            `Your organization "${orgName}" and its associated team memberships and mail directory records have been permanently deleted.`,
          ],
          details: [
            { label: 'Organization', value: orgName },
            { label: 'Domain', value: orgDomain },
            { label: 'Actioned By', value: ownerEmail },
            { label: 'Timestamp', value: new Date().toISOString() },
          ],
          ctaUrl: 'https://app.revlet.me/account/home',
          ctaLabel: 'Open Account Home',
        });
      } catch {
        // Non-blocking confirmation email
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting organization:', error);
    return { success: false, error: error.message || 'Failed to delete organization' };
  }
}
