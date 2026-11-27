'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { assertStepUpMfa, verifyUserOrgAccess } from './auth-helper';
import { adminAuth, adminDb } from '@/firebase/admin';
import { ORG_ADMIN_PERMISSION } from '@/lib/team-permissions';
import { callStalwartJmap, dispatchStalwartApi } from '@/lib/mail-internal';
import {
  resolveOrganizationOwnerEmail,
  sendRevletAlertEmail,
} from '@/lib/revlet-alerts';

/**
 * Unified server action for creating a new organization workspace across
 * Sign-Up, Account Home, and the Org Switcher. Validates and normalizes
 * the domain and populates required contact & membership fields.
 */
export async function createOrganizationWorkspace(
  idToken: string,
  input: {
    name: string;
    domain: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    phone?: string;
    description?: string;
  }
) {
  if (!idToken) return { success: false, error: 'Authentication required.' };
  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const uid = decoded.uid;
    const ownerEmail = (decoded.email || '').toLowerCase().trim();
    const ownerName = (decoded.name || ownerEmail.split('@')[0] || 'Account Owner').trim();

    const cleanName = (input.name || '').trim().slice(0, 120);
    const cleanDomain = (input.domain || '')
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/\.$/, '');

    if (!cleanName) {
      return { success: false, error: 'Organization name is required.' };
    }
    if (
      !cleanDomain ||
      !cleanDomain.includes('.') ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(cleanDomain)
    ) {
      return { success: false, error: 'A valid root domain (e.g. example.com) is required.' };
    }

    const uniqueSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const prefix = cleanName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'ORG';
    const orgCode = `${prefix}-${uniqueSuffix}`;

    const contactName = (input.contactName || ownerName).trim().slice(0, 120);
    const contactEmail = (input.contactEmail || ownerEmail).toLowerCase().trim();

    const docRef = await adminDb.collection('organizations').add({
      ownerId: uid,
      ownerName,
      ownerEmail: ownerEmail || null,
      memberIds: [uid],
      memberEmails: ownerEmail ? [ownerEmail] : [],
      name: cleanName,
      domain: cleanDomain,
      code: orgCode,
      contactName,
      contactEmail,
      contactPhone: (input.contactPhone || '').trim().slice(0, 40),
      address: (input.address || '').trim().slice(0, 240),
      phone: (input.phone || '').trim().slice(0, 40),
      description: (input.description || '').trim().slice(0, 500),
      status: 'Active',
      mailServiceActive: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      data: {
        id: docRef.id,
        name: cleanName,
        domain: cleanDomain,
        code: orgCode,
      },
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to create organization.' };
  }
}

export async function deleteOrganization(
  idToken: string,
  orgId: string,
  stepUpToken?: string
) {
  if (!idToken || !orgId) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const authResult = await verifyUserOrgAccess(idToken, orgId);
    if (!authResult.isOwner) {
      return { success: false, error: 'Unauthorized: Only the organization owner can delete this organization.' };
    }

    assertStepUpMfa(authResult.uid, stepUpToken);

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return { success: false, error: 'Organization not found.' };
    }
    const orgData = orgSnap.data() || {};
    const orgName = String(orgData.name || orgData.domain || orgId);
    const orgDomain = String(orgData.domain || 'N/A');
    const ownerEmail =
      (authResult.email ? authResult.email.toLowerCase().trim() : null) ||
      (await resolveOrganizationOwnerEmail(orgData));

    const domain = String(orgData.domain || '').toLowerCase().replace(/\.$/, '').trim();

    // Refuse deletion if any active Legal Hold protects this organization's mail data
    const activeHoldsSnap = await orgRef
      .collection('mailLegalHolds')
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (!activeHoldsSnap.empty) {
      return {
        success: false,
        error: 'This organization has an active Legal Hold and cannot be deleted until all holds are released.',
      };
    }

    // Mark workspace Pending Deletion before starting cleanup
    await orgRef.update({
      status: 'Pending Deletion',
      deletionRequestedAt: new Date().toISOString(),
      deletionRequestedBy: authResult.email || authResult.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 1. Query associated team members and ALL organization subcollections
    const [
      membersLegacySnap,
      membersArraySnap,
      mailUsersSnap,
      mailGroupsSnap,
      mailSharedSnap,
      mailUserMfaSnap,
      mailUserSettingsSnap,
      mailOusSnap,
      mailHoldsSnap,
      mailDlpSnap,
      mailTransportSnap,
      mailQuarantineSnap,
      mailQuotaSubsSnap,
      dnsSnapshotsSnap,
      secretsSnap,
      privateSecretsSnap,
      snsEventsSnap,
    ] = await Promise.all([
      adminDb.collection('teamMembers').where('organizationId', '==', orgId).get(),
      adminDb.collection('teamMembers').where('organizationIds', 'array-contains', orgId).get(),
      orgRef.collection('mailUsers').get(),
      orgRef.collection('mailGroups').get(),
      orgRef.collection('mailSharedMailboxes').get(),
      orgRef.collection('mailUserMfa').get(),
      orgRef.collection('mailUserSettings').get(),
      orgRef.collection('mailOrgUnits').get(),
      orgRef.collection('mailLegalHolds').get(),
      orgRef.collection('mailDlpRules').get(),
      orgRef.collection('mailTransportRules').get(),
      orgRef.collection('mailQuarantine').get(),
      orgRef.collection('mailQuotaSubmissions').get(),
      orgRef.collection('dns_snapshots').get(),
      orgRef.collection('secrets').get(),
      orgRef.collection('privateSecrets').get(),
      orgRef.collection('snsProcessedEvents').get(),
    ]);

    // 2. Only deprovision Stalwart principals/domain if THIS organization owns the verified mail domain binding!
    let ownsMailBinding = false;
    if (domain) {
      const bindingSnap = await adminDb.collection('mailDomainBindings').doc(domain).get();
      if (bindingSnap.exists) {
        ownsMailBinding = bindingSnap.data()?.orgId === orgId;
      } else if (orgData.mailServiceActive === true) {
        const otherActive = await adminDb
          .collection('organizations')
          .where('domain', '==', domain)
          .where('mailServiceActive', '==', true)
          .get();
        ownsMailBinding = !otherActive.docs.some((d) => d.id !== orgId);
      }
    }

    if (ownsMailBinding && domain) {
      for (const uDoc of mailUsersSnap.docs) {
        const primaryEmail = (uDoc.data().primaryEmail || '').toLowerCase().trim();
        if (primaryEmail && primaryEmail.endsWith(`@${domain}`)) {
          await dispatchStalwartApi('DELETE', `/api/principal/${encodeURIComponent(primaryEmail)}`).catch(() => null);
        }
      }
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

    // Release verified domain and DNS zone bindings if owned by this org
    if (domain && ownsMailBinding) {
      const mailBindingRef = adminDb.collection('mailDomainBindings').doc(domain);
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(mailBindingRef);
        if (snap.exists && snap.data()?.orgId === orgId) {
          tx.delete(mailBindingRef);
        }
      });
    }
    if (orgData.cloudflareZoneId) {
      const zoneBindingRef = adminDb.collection('system_zone_bindings').doc(String(orgData.cloudflareZoneId));
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(zoneBindingRef);
        if (snap.exists && snap.data()?.orgId === orgId) {
          tx.delete(zoneBindingRef);
        }
      });
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
      ...mailSharedSnap.docs.map((d) => d.ref),
      ...mailUserMfaSnap.docs.map((d) => d.ref),
      ...mailUserSettingsSnap.docs.map((d) => d.ref),
      ...mailOusSnap.docs.map((d) => d.ref),
      ...mailHoldsSnap.docs.map((d) => d.ref),
      ...mailDlpSnap.docs.map((d) => d.ref),
      ...mailTransportSnap.docs.map((d) => d.ref),
      ...mailQuarantineSnap.docs.map((d) => d.ref),
      ...mailQuotaSubsSnap.docs.map((d) => d.ref),
      ...dnsSnapshotsSnap.docs.map((d) => d.ref),
      ...secretsSnap.docs.map((d) => d.ref),
      ...privateSecretsSnap.docs.map((d) => d.ref),
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
