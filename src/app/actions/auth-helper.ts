import { adminAuth, adminDb } from '@/firebase/admin';

export type VerifiedUserOrg = {
  uid: string;
  email?: string;
  isOwner: boolean;
  isMember: boolean;
  orgData: any;
};

/**
 * Validates the caller's Firebase session and asserts permissions for the target organization.
 * Prevents IDOR and privilege escalation across tenants.
 */
export async function verifyUserOrgAccess(
  idToken: string,
  orgId: string,
  expectedZoneId?: string
): Promise<VerifiedUserOrg> {
  if (!idToken || !orgId) {
    throw new Error("Unauthorized: Missing credentials.");
  }

  const decodedToken = await adminAuth.verifyIdToken(idToken);
  const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
  
  if (!orgDoc.exists) {
    throw new Error("Organization not found.");
  }

  const orgData = orgDoc.data();
  const isOwner = orgData?.ownerId === decodedToken.uid;

  let isMember = false;
  if (!isOwner && decodedToken.email) {
    const memberQuery = await adminDb.collection('teamMembers')
      .where('organizationId', '==', orgId)
      .where('ownerId', '==', orgData?.ownerId)
      .where('email', '==', decodedToken.email.toLowerCase().trim())
      .where('status', '==', 'Active')
      .get();
    isMember = !memberQuery.empty;
  }

  if (!isOwner && !isMember) {
    throw new Error("Unauthorized: Access denied to this organization.");
  }

  if (expectedZoneId && orgData?.cloudflareZoneId && orgData.cloudflareZoneId !== expectedZoneId) {
    throw new Error("Unauthorized: Target zone does not match organization.");
  }

  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    isOwner,
    isMember,
    orgData,
  };
}
