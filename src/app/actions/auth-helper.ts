import { adminAuth, adminDb } from '@/firebase/admin';
import { decryptToken } from '@/lib/security/encryption';

export type VerifiedUserOrg = {
  uid: string;
  email?: string;
  isOwner: boolean;
  isMember: boolean;
  permissions: string[];
  orgData: any;
  cfToken?: string;
};

export function hasOrgPermission(
  permissions: string[],
  required?: string | string[]
): boolean {
  if (!required) return true;
  if (permissions.includes('*') || permissions.includes('Org: Admin')) return true;
  const reqList = Array.isArray(required) ? required : [required];
  return reqList.some((r) => permissions.includes(r));
}

/**
 * Validates the caller's Firebase session and asserts permissions for the target organization.
 * Prevents IDOR and privilege escalation across tenants.
 */
export async function verifyUserOrgAccess(
  idToken: string,
  orgId: string,
  expectedZoneId?: string,
  requiredPermissions?: string | string[]
): Promise<VerifiedUserOrg> {
  if (!idToken || !orgId) {
    throw new Error("Unauthorized: Missing credentials.");
  }

  // Pre-flight check: ensure Firebase Admin has credentials in production
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY && !process.env.FIREBASE_CLIENT_EMAIL) {
    console.error("[Auth Helper] Missing FIREBASE_SERVICE_ACCOUNT_KEY in environment variables.");
    throw new Error("Configuration Error: FIREBASE_SERVICE_ACCOUNT_KEY is missing in your deployment environment variables.");
  }

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(idToken);
  } catch (err: any) {
    console.error("[Auth Helper] Token verification failed:", err?.message);
    throw new Error(`Authentication failed: ${err?.message || "Invalid or expired session token."}`);
  }

  let orgDoc;
  try {
    orgDoc = await adminDb.collection('organizations').doc(orgId).get();
  } catch (err: any) {
    console.error("[Auth Helper] Firestore organization lookup failed:", err?.message);
    throw new Error(`Database access failed: ${err?.message || "Unable to read organization data."}`);
  }
  
  if (!orgDoc.exists) {
    throw new Error("Organization not found.");
  }

  const orgData = orgDoc.data();
  const userEmail = decodedToken.email?.toLowerCase().trim();
  const isSuperAdmin = (decodedToken as any).admin === true;
  const isOwner = isSuperAdmin || orgData?.ownerId === decodedToken.uid;

  let isMember = isOwner;
  let permissions: string[] = isOwner ? ['*'] : [];

  if (!isOwner && userEmail) {
    if (decodedToken.email_verified !== true) {
      throw new Error("Unauthorized: Email verification is required to access shared organizations.");
    }

    const emailPermKey = userEmail.replace(/\./g, '__DOT__');
    const orgMemberPerms = orgData?.memberPermissions?.[emailPermKey];
    if (Array.isArray(orgMemberPerms)) {
      permissions = orgMemberPerms;
    }

    const inMemberEmails =
      Array.isArray(orgData?.memberEmails) &&
      orgData.memberEmails.map((e: string) => e.toLowerCase().trim()).includes(userEmail);

    try {
      const memberSnap = await adminDb.collection('teamMembers')
        .where('ownerId', '==', orgData?.ownerId)
        .where('email', '==', userEmail)
        .limit(1)
        .get();

      if (!memberSnap.empty) {
        const mData = memberSnap.docs[0].data();
        const mOrgs: string[] = Array.isArray(mData.organizationIds)
          ? mData.organizationIds
          : mData.organizationId
          ? [mData.organizationId]
          : [];
        if (mOrgs.includes(orgId)) {
          if (mData.status === 'Suspended' || mData.status === 'Inactive') {
            throw new Error("Unauthorized: Your access to this organization has been suspended.");
          }
          if (mData.status === 'Active' || inMemberEmails) {
            isMember = true;
            if (permissions.length === 0) {
              const perOrgPerms = mData.orgPermissions?.[orgId];
              if (Array.isArray(perOrgPerms)) {
                permissions = perOrgPerms;
              } else if (Array.isArray(mData.permissions)) {
                permissions = mData.permissions;
              }
            }
          }
        }
      } else if (inMemberEmails) {
        isMember = true;
      }
    } catch (err: any) {
      if (err?.message?.includes('suspended')) throw err;
      console.warn("[Auth Helper] Team member lookup warning:", err?.message);
    }
  }

  if (!isOwner && !isMember) {
    throw new Error("Unauthorized: Access denied to this organization.");
  }

  if (requiredPermissions && !hasOrgPermission(permissions, requiredPermissions)) {
    throw new Error("Unauthorized: Insufficient organization permissions for this action.");
  }

  if (expectedZoneId && (!orgData?.cloudflareZoneId || orgData.cloudflareZoneId !== expectedZoneId)) {
    throw new Error("Unauthorized: Target zone does not match organization.");
  }

  let cfToken: string | undefined = undefined;
  let encryptedTokenEnvelope = orgData?.cloudflareTokenEncrypted;
  try {
    const secretSnap = await orgDoc.ref.collection('secrets').doc('cloudflare').get();
    if (secretSnap.exists && secretSnap.data()?.ciphertext) {
      encryptedTokenEnvelope = secretSnap.data();
    }
  } catch (e: any) {
    console.warn("[Auth Helper] Failed to read Cloudflare secret subdoc:", e?.message);
  }

  if (encryptedTokenEnvelope?.ciphertext) {
    try {
      cfToken = decryptToken(encryptedTokenEnvelope);
    } catch (e: any) {
      console.error("[Auth Helper] Failed to decrypt organization Cloudflare token:", e?.message);
    }
  }

  // Platform fallback: use platform Cloudflare token if tenant did not supply BYOT token
  if (!cfToken && process.env.CLOUDFLARE_DNS_TOKEN) {
    cfToken = process.env.CLOUDFLARE_DNS_TOKEN.trim();
  }

  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    isOwner,
    isMember,
    permissions,
    orgData,
    cfToken,
  };
}
