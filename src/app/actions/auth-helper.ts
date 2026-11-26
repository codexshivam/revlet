import { adminAuth, adminDb } from '@/firebase/admin';
import { decryptToken } from '@/lib/security/encryption';
import { verifyStepUpToken } from '@/lib/mfa';

export function assertStepUpMfa(uid: string, stepUpToken?: string | null): void {
  const verified = verifyStepUpToken(stepUpToken, uid);
  if (!verified) {
    throw new Error('MFA_STEP_UP_REQUIRED: Please complete Step-Up MFA verification to continue.');
  }
}

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

  if (!isOwner) {
    if (!userEmail || decodedToken.email_verified !== true) {
      throw new Error("Unauthorized: Email verification is required to access shared organizations.");
    }

    // Active, UID-bound membership in teamMembers is the single source of authorization.
    // Pending invitations grant zero access; Suspended/Inactive blocks immediately.
    const [byUidSnap, byEmailSnap] = await Promise.all([
      adminDb
        .collection('teamMembers')
        .where('ownerId', '==', orgData?.ownerId)
        .where('memberUid', '==', decodedToken.uid)
        .limit(5)
        .get(),
      adminDb
        .collection('teamMembers')
        .where('ownerId', '==', orgData?.ownerId)
        .where('email', '==', userEmail)
        .limit(5)
        .get(),
    ]);

    const candidateDocs = new Map<string, any>();
    for (const d of [...byUidSnap.docs, ...byEmailSnap.docs]) {
      candidateDocs.set(d.id, d.data());
    }

    for (const mData of candidateDocs.values()) {
      const mOrgs: string[] = Array.isArray(mData.organizationIds)
        ? mData.organizationIds
        : mData.organizationId
        ? [mData.organizationId]
        : [];
      if (!mOrgs.includes(orgId)) continue;

      if (mData.status === 'Suspended' || mData.status === 'Inactive') {
        throw new Error("Unauthorized: Your access to this organization has been suspended.");
      }
      if (mData.status !== 'Active') {
        // Pending invitations must be explicitly accepted before granting access
        continue;
      }
      // If bound to a UID, enforce exact UID match
      if (mData.memberUid && mData.memberUid !== decodedToken.uid) {
        continue;
      }

      isMember = true;
      const perOrgPerms = mData.orgPermissions?.[orgId];
      if (Array.isArray(perOrgPerms)) {
        permissions = perOrgPerms;
      } else if (Array.isArray(mData.permissions)) {
        permissions = mData.permissions;
      }
      break;
    }
  }

  if (!isOwner && !isMember) {
    throw new Error("Unauthorized: Access denied to this organization.");
  }

  if (requiredPermissions && !hasOrgPermission(permissions, requiredPermissions)) {
    throw new Error("Unauthorized: Insufficient organization permissions for this action.");
  }

  let cfToken: string | undefined = undefined;
  let secretData: any = null;
  let encryptedTokenEnvelope = orgData?.cloudflareTokenEncrypted;
  try {
    const secretSnap = await orgDoc.ref.collection('secrets').doc('cloudflare').get();
    if (secretSnap.exists && secretSnap.data()?.ciphertext) {
      secretData = secretSnap.data();
      encryptedTokenEnvelope = secretData;
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

  // Derive effective DNS mode while supporting legacy orgs created before dnsMode was persisted:
  // - Server-only secrets/cloudflare subdoc => 'byot'
  // - Legacy managed org with cloudflareZoneId + dnsRequested => 'managed'
  const hasServerByotSecret = Boolean(secretData?.ciphertext || orgData?.cloudflareTokenAudit?.zoneId);
  const resolvedDnsMode: 'byot' | 'managed' | null =
    orgData?.dnsMode === 'byot' || hasServerByotSecret
      ? 'byot'
      : orgData?.dnsMode === 'managed' || (Boolean(orgData?.cloudflareZoneId) && Boolean(orgData?.dnsRequested))
      ? 'managed'
      : null;

  if (expectedZoneId) {
    if (!orgData?.cloudflareZoneId || orgData.cloudflareZoneId !== expectedZoneId) {
      throw new Error("Unauthorized: Target zone does not match organization.");
    }
    if (!resolvedDnsMode) {
      throw new Error("Unauthorized: Organization does not have a verified server-managed DNS binding.");
    }
    if (resolvedDnsMode === 'byot' && secretData?.zoneId && secretData.zoneId !== expectedZoneId) {
      throw new Error("Unauthorized: Stored BYOT credential is not bound to this zone.");
    }
    // Lazily backfill dnsMode on legacy organizations so future checks are direct
    if (!orgData?.dnsMode && resolvedDnsMode) {
      orgDoc.ref.update({ dnsMode: resolvedDnsMode }).catch(() => {});
    }
  }

  // Strictly scope credential resolution to the organization's dnsMode:
  // BYOT orgs MUST NEVER fall back to the platform Cloudflare token.
  if (resolvedDnsMode === 'byot') {
    if (!cfToken && expectedZoneId) {
      throw new Error("Cloudflare BYOT credential is unavailable for this organization. Please reconnect your token.");
    }
  } else if (!cfToken && process.env.CLOUDFLARE_DNS_TOKEN) {
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
