'use server';

import { verifyUserOrgAccess } from './auth-helper';
import { adminDb } from '@/firebase/admin';

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

    // 1. Delete associated team members and Email Service subcollections
    const [membersSnap, mailUsersSnap, mailGroupsSnap, mailOusSnap, mailLogsSnap] = await Promise.all([
      adminDb.collection('teamMembers').where('organizationId', '==', orgId).get(),
      orgRef.collection('mailUsers').get(),
      orgRef.collection('mailGroups').get(),
      orgRef.collection('mailOrgUnits').get(),
      orgRef.collection('mailAuditLogs').get(),
    ]);

    const batch = adminDb.batch();
    membersSnap.docs.forEach((doc) => batch.delete(doc.ref));
    mailUsersSnap.docs.forEach((doc) => batch.delete(doc.ref));
    mailGroupsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    mailOusSnap.docs.forEach((doc) => batch.delete(doc.ref));
    mailLogsSnap.docs.forEach((doc) => batch.delete(doc.ref));

    // 2. Delete the organization document itself
    batch.delete(orgRef);

    await batch.commit();

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting organization:', error);
    return { success: false, error: error.message || 'Failed to delete organization' };
  }
}
