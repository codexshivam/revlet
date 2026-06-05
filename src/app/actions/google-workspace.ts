'use server';

/**
 * @fileOverview Google Workspace Admin SDK Server Actions
 * Handles API interactions for Google Workspace for Education management.
 * Uses service account with Domain-Wide Delegation for impersonation.
 * Each organization provides its own admin email for impersonation.
 */

import { google } from 'googleapis';
import { revalidatePath } from 'next/cache';
import { adminAuth, adminDb } from '@/firebase/admin';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WorkspaceUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  orgUnitPath: string
  suspended: boolean
  archived: boolean
  isAdmin: boolean
  creationTime: string
  lastLoginTime: string
  thumbnailPhotoUrl?: string
}

export type WorkspaceOU = {
  orgUnitId: string
  orgUnitPath: string
  name: string
  description?: string
  parentOrgUnitPath: string
}

export type WorkspaceAlert = {
  alertId: string
  type: string
  source: string
  severity: string
  createTime: string
  startTime?: string
  endTime?: string
  data?: any
}

export type StorageUsageEntry = {
  email: string
  usedBytes: number
  totalBytes: number
}

// ─── Auth Helper ─────────────────────────────────────────────────────────────

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      'Google Workspace service account key not configured. ' +
      'Set GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY in your .env.local file.'
    );
  }

  try {
    // Support both raw JSON and base64-encoded JSON
    const cleaned = raw.trim().replace(/^["']|["']$/g, '');
    let jsonStr: string;

    // Try parsing as raw JSON first
    try {
      JSON.parse(cleaned);
      jsonStr = cleaned;
    } catch {
      // Assume base64-encoded
      jsonStr = Buffer.from(cleaned, 'base64').toString('utf-8');
    }

    return JSON.parse(jsonStr);
  } catch (error: any) {
    throw new Error(
      'Failed to parse service account credentials. Ensure the key is valid JSON or base64-encoded JSON.'
    );
  }
}

async function getAdminClient(adminEmail: string) {
  if (!adminEmail) {
    throw new Error('Admin email is required for Google Workspace API impersonation.');
  }

  const credentials = getServiceAccountCredentials();

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.user',
      'https://www.googleapis.com/auth/admin.directory.orgunit',
      'https://www.googleapis.com/auth/admin.directory.customer.readonly',
      'https://www.googleapis.com/auth/admin.reports.audit.readonly',
      'https://www.googleapis.com/auth/admin.reports.usage.readonly',
    ],
    subject: adminEmail,
  });

  return auth;
}

function translateError(error: any): string {
  const message = error.message || '';
  const code = error.code || error.status || 0;

  if (code === 401 || message.includes('Unauthorized') || message.includes('invalid_grant')) {
    return 'Authentication failed. The service account credentials are invalid or Domain-Wide Delegation is not configured correctly. Please verify the setup in Google Admin Console → Security → API Controls → Domain-Wide Delegation.';
  }
  if (code === 403 || message.includes('Forbidden') || message.includes('Not Authorized')) {
    return 'Access denied. The service account does not have sufficient permissions. Ensure Domain-Wide Delegation is enabled with the required scopes, and the admin email has Super Admin privileges.';
  }
  if (code === 404 || message.includes('Not Found')) {
    return 'Resource not found. The requested user, OU, or domain does not exist.';
  }
  if (code === 409 || message.includes('already exists')) {
    return 'Conflict: This resource already exists. Please use a different name or email address.';
  }
  if (code === 429 || message.includes('Rate Limit') || message.includes('rateLimitExceeded')) {
    return 'Rate limit exceeded. Google Workspace API limits have been reached. Please wait a moment and try again.';
  }
  if (message.includes('fetch failed') || message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
    return 'Network connection failed. Unable to reach Google Workspace APIs. Please check your internet connection.';
  }

  return message || 'An unexpected error occurred while communicating with Google Workspace.';
}

// ─── Simple In-Memory Cache ──────────────────────────────────────────────────
// Caches heavy API calls for 2 minutes to make dashboard loading instantaneous
const cacheMap = new Map<string, { data: any; expiry: number }>();

async function withCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = cacheMap.get(key);
  if (cached && cached.expiry > now) {
    return cached.data;
  }
  const data = await fetcher();
  // Only cache if successful (assuming returned object has { success: true })
  if ((data as any)?.success === true) {
    cacheMap.set(key, { data, expiry: now + ttlSeconds * 1000 });
  }
  return data;
}

// ─── Customer / Domain Verification ──────────────────────────────────────────

async function verifyAdminAccess(idToken: string, orgId: string, bypassEmailCheck = false): Promise<string> {
  if (!idToken || !orgId) throw new Error("Unauthorized: Missing credentials.");

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
    if (!orgDoc.exists) throw new Error("Organization not found.");
    
    const orgData = orgDoc.data();
    
    // Check if user is owner or member
    const isOwner = orgData?.ownerId === decodedToken.uid;
    
    let isMember = false;
    if (!isOwner && decodedToken.email) {
      const memberQuery = await adminDb.collection('teamMembers')
        .where('organizationId', '==', orgId)
        .where('email', '==', decodedToken.email)
        .where('status', '==', 'Active')
        .get();
      isMember = !memberQuery.empty;
    }
    
    if (!isOwner && !isMember) {
      throw new Error("Unauthorized: You do not have access to this organization.");
    }

    if (!bypassEmailCheck && !orgData?.workspaceAdminEmail) {
      throw new Error("Google Workspace is not configured for this organization.");
    }

    return orgData?.workspaceAdminEmail || '';
  } catch (error: any) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

export async function checkWorkspaceStatus(idToken: string, orgId: string, adminEmail?: string) {
  try {
    // Verify user owns the org (bypass email check if custom email is provided, otherwise require email from DB)
    const dbAdminEmail = await verifyAdminAccess(idToken, orgId, !adminEmail ? false : true);
    const targetEmail = adminEmail || dbAdminEmail;
    
    if (!targetEmail) return { success: false, error: 'Admin email is required.' };

    const auth = await getAdminClient(targetEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    const customerRes = await admin.customers.get({ customerKey: 'my_customer' });
    const customer = customerRes.data;

    // Verify it's an active workspace by listing 1 user
    const usersRes = await admin.users.list({
      customer: 'my_customer',
      maxResults: 1,
    });

    return {
      success: true,
      data: {
        customerId: customer.id || '',
        customerDomain: customer.customerDomain || '',
        verified: true,
        totalUsers: usersRes.data.users?.length || 0,
      },
    };
  } catch (error: any) {
    console.error('[Google Workspace] Status check failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function listUsers(
  idToken: string,
  orgId: string,
  
  options?: {
    query?: string
    orgUnitPath?: string
    pageToken?: string
    maxResults?: number
    showDeleted?: boolean
    showActiveOnly?: boolean
    showArchivedOnly?: boolean
  }

) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail) return { success: false, error: 'Admin email is required.' };

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    const params: any = {
      customer: 'my_customer',
      maxResults: options?.maxResults || 100,
      orderBy: 'email',
      projection: 'full',
    };

    let queryParts: string[] = [];
    if (options?.orgUnitPath) {
      queryParts.push(`orgUnitPath='${options.orgUnitPath}'`);
    }
    if (options?.showActiveOnly) {
      queryParts.push('isSuspended=false');
    }
    if (options?.showArchivedOnly) {
      queryParts.push('isArchived=true');
    }
    if (options?.query) {
      const term = options.query.trim();
      if (term) {
        if (term.includes('@')) {
          queryParts.push(`email:${term}*`);
        } else {
          // Send generic search without field specifier
          const words = term.split(/\s+/);
          const genericQuery = words.map(w => `${w}*`).join(' ');
          queryParts.push(genericQuery);
        }
      }
    }

    if (queryParts.length > 0) {
      params.query = queryParts.join(' ');
    }

    if (options?.pageToken) params.pageToken = options.pageToken;
    if (options?.showDeleted) params.showDeleted = 'true';

    const res = await admin.users.list(params);

    const users: WorkspaceUser[] = (res.data.users || []).map((u: any) => ({
      id: u.id || '',
      email: u.primaryEmail || '',
      firstName: u.name?.givenName || '',
      lastName: u.name?.familyName || '',
      fullName: u.name?.fullName || '',
      orgUnitPath: u.orgUnitPath || '/',
      suspended: u.suspended || false,
      archived: u.archived || false,
      isAdmin: u.isAdmin || false,
      creationTime: u.creationTime || '',
      lastLoginTime: u.lastLoginTime || '',
      thumbnailPhotoUrl: u.thumbnailPhotoUrl || undefined,
    }));

    return {
      success: true,
      data: {
        users,
        nextPageToken: res.data.nextPageToken || null,
        totalUsers: users.length,
      },
    };
  } catch (error: any) {
    console.error('[Google Workspace] List users failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

export async function getUser(
  idToken: string,
  orgId: string,
   userKey: string
) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail || !userKey) return { success: false, error: 'Admin email and user key are required.' };

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    const res = await admin.users.get({
      userKey,
      projection: 'full',
    });

    const u = res.data;
    const user: WorkspaceUser = {
      id: u.id || '',
      email: u.primaryEmail || '',
      firstName: u.name?.givenName || '',
      lastName: u.name?.familyName || '',
      fullName: u.name?.fullName || '',
      orgUnitPath: u.orgUnitPath || '/',
      suspended: u.suspended || false,
      archived: u.archived || false,
      isAdmin: u.isAdmin || false,
      creationTime: u.creationTime || '',
      lastLoginTime: u.lastLoginTime || '',
      thumbnailPhotoUrl: u.thumbnailPhotoUrl || undefined,
    };

    return { success: true, data: user };
  } catch (error: any) {
    console.error('[Google Workspace] Get user failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

export async function createUser(
  idToken: string,
  orgId: string,
  
  userData: {
    firstName: string
    lastName: string
    email: string
    password: string
    orgUnitPath?: string
  }

) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail) return { success: false, error: 'Admin email is required.' };
  if (!userData.firstName || !userData.lastName || !userData.email || !userData.password) {
    return { success: false, error: 'First name, last name, email, and password are all required.' };
  }
  if (userData.password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    const res = await admin.users.insert({
      requestBody: {
        primaryEmail: userData.email,
        name: {
          givenName: userData.firstName,
          familyName: userData.lastName,
        },
        password: userData.password,
        changePasswordAtNextLogin: true,
        orgUnitPath: userData.orgUnitPath || '/',
      },
    });

    revalidatePath('/services/workspace/users');
    revalidatePath('/services/workspace/deactivated');

    return {
      success: true,
      data: {
        id: res.data.id || '',
        email: res.data.primaryEmail || '',
        fullName: `${userData.firstName} ${userData.lastName}`,
      },
    };
  } catch (error: any) {
    console.error('[Google Workspace] Create user failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

export async function updateUser(
  idToken: string,
  orgId: string,
  
  userKey: string,
  updates: {
    firstName?: string
    lastName?: string
    email?: string
    orgUnitPath?: string
    suspended?: boolean
    archived?: boolean
  }

) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail || !userKey) return { success: false, error: 'Admin email and user key are required.' };

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    const requestBody: any = {};
    if (updates.firstName || updates.lastName) {
      requestBody.name = {};
      if (updates.firstName) requestBody.name.givenName = updates.firstName;
      if (updates.lastName) requestBody.name.familyName = updates.lastName;
    }
    if (updates.email) requestBody.primaryEmail = updates.email;
    if (updates.orgUnitPath) requestBody.orgUnitPath = updates.orgUnitPath;
    if (updates.suspended !== undefined) requestBody.suspended = updates.suspended;
    if (updates.archived !== undefined) requestBody.archived = updates.archived;

    const res = await admin.users.update({
      userKey,
      requestBody,
    });

    revalidatePath('/services/workspace/users');
    revalidatePath('/services/workspace/deactivated');

    return {
      success: true,
      data: {
        id: res.data.id || '',
        email: res.data.primaryEmail || '',
        suspended: res.data.suspended || false,
      },
    };
  } catch (error: any) {
    console.error('[Google Workspace] Update user failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

export async function resetUserPassword(
  idToken: string,
  orgId: string,
  
  userKey: string,
  newPassword: string

) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail || !userKey) return { success: false, error: 'Admin email and user key are required.' };
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters long.' };
  }

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    await admin.users.update({
      userKey,
      requestBody: {
        password: newPassword,
        changePasswordAtNextLogin: true,
      },
    });

    revalidatePath('/services/workspace/users');

    return { success: true, data: { message: 'Password reset successfully. User will be prompted to change it on next login.' } };
  } catch (error: any) {
    console.error('[Google Workspace] Reset password failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

export async function deleteUser(
  idToken: string,
  orgId: string,
   userKey: string
) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail || !userKey) return { success: false, error: 'Admin email and user key are required.' };

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    await admin.users.delete({ userKey });

    revalidatePath('/services/workspace/users');
    revalidatePath('/services/workspace/deactivated');

    return { success: true, data: { message: 'User account has been deleted.' } };
  } catch (error: any) {
    console.error('[Google Workspace] Delete user failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

export async function undeleteUser(
  idToken: string,
  orgId: string,
   userKey: string, orgUnitPath?: string
) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail || !userKey) return { success: false, error: 'Admin email and user key are required.' };

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    await admin.users.undelete({
      userKey,
      requestBody: {
        orgUnitPath: orgUnitPath || '/',
      },
    });

    revalidatePath('/services/workspace/users');
    revalidatePath('/services/workspace/deactivated');

    return { success: true, data: { message: 'User account has been successfully recovered.' } };
  } catch (error: any) {
    console.error('[Google Workspace] Undelete user failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

export async function listDeletedUsers(
  idToken: string,
  orgId: string,
  
) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail) return { success: false, error: 'Admin email is required.' };

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    const res = await admin.users.list({
      customer: 'my_customer',
      showDeleted: 'true',
      maxResults: 100,
    });

    const users = (res.data.users || []).map((u: any) => ({
      id: u.id || '',
      email: u.primaryEmail || '',
      firstName: u.name?.givenName || '',
      lastName: u.name?.familyName || '',
      fullName: u.name?.fullName || '',
      orgUnitPath: u.orgUnitPath || '/',
      suspended: u.suspended || false,
      isAdmin: u.isAdmin || false,
      creationTime: u.creationTime || '',
      lastLoginTime: u.lastLoginTime || '',
      deletionTime: u.deletionTime || '',
    }));

    return { success: true, data: users };
  } catch (error: any) {
    console.error('[Google Workspace] List deleted users failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

// ─── Organizational Units ────────────────────────────────────────────────────

export async function listOrgUnits(
  idToken: string,
  orgId: string,
  
) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail) return { success: false, error: 'Admin email is required.' };

  return withCache(`orgunits-${adminEmail}`, 300, async () => {
    try {
      const auth = await getAdminClient(adminEmail);
      const admin = google.admin({ version: 'directory_v1', auth });

    const res = await admin.orgunits.list({
      customerId: 'my_customer',
      type: 'ALL',
    });

    const ous: WorkspaceOU[] = (res.data.organizationUnits || []).map((ou: any) => ({
      orgUnitId: ou.orgUnitId || '',
      orgUnitPath: ou.orgUnitPath || '',
      name: ou.name || '',
      description: ou.description || '',
      parentOrgUnitPath: ou.parentOrgUnitPath || '/',
    }));

    return { success: true, data: ous };
    } catch (error: any) {
      console.error('[Google Workspace] List OUs failed:', error.message);
      return { success: false, error: translateError(error) };
    }
  });
}

export async function createOrgUnit(
  idToken: string,
  orgId: string,
  
  name: string,
  parentOrgUnitPath?: string,
  description?: string

) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail || !name) return { success: false, error: 'Admin email and OU name are required.' };

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    const res = await admin.orgunits.insert({
      customerId: 'my_customer',
      requestBody: {
        name,
        parentOrgUnitPath: parentOrgUnitPath || '/',
        description: description || '',
      },
    });

    revalidatePath('/services/workspace/users');

    return {
      success: true,
      data: {
        orgUnitId: res.data.orgUnitId || '',
        orgUnitPath: res.data.orgUnitPath || '',
        name: res.data.name || '',
      },
    };
  } catch (error: any) {
    console.error('[Google Workspace] Create OU failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

export async function deleteOrgUnit(
  idToken: string,
  orgId: string,
   orgUnitPath: string
) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail || !orgUnitPath) return { success: false, error: 'Admin email and OU path are required.' };

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    // The API requires the OU path segments without the leading slash for the URL
    const pathSegments = orgUnitPath.startsWith('/') ? orgUnitPath.substring(1) : orgUnitPath;

    await admin.orgunits.delete({
      customerId: 'my_customer',
      orgUnitPath: pathSegments,
    });

    revalidatePath('/services/workspace/users');

    return { success: true, data: { message: `Organizational unit "${orgUnitPath}" has been deleted.` } };
  } catch (error: any) {
    console.error('[Google Workspace] Delete OU failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}

// ─── Storage / Usage Reports ─────────────────────────────────────────────────

export async function getUserStorageReport(
  idToken: string,
  orgId: string,
   date?: string
) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail) return { success: false, error: 'Admin email is required.' };

  return withCache(`storage-${adminEmail}-${date || 'latest'}`, 120, async () => {
    try {
    const auth = await getAdminClient(adminEmail);
    const reports = google.admin({ version: 'reports_v1', auth });

    // Try up to 7 days ago to find available usage report data
    let reportData = null;
    
    if (date) {
      try {
        const res = await (reports as any).userUsageReport.get({
          userKey: 'all',
          date: date,
          parameters: 'accounts:drive_used_quota_in_mb,accounts:total_quota_in_mb',
          maxResults: 500,
        });
        reportData = res.data;
      } catch (err: any) {
        if (err.code === 400 || err.message?.includes('Data for dates')) {
          reportData = null;
        } else {
          throw err;
        }
      }
    } else {
      // Execute 7 parallel requests (1 to 7 days ago) to find the most recent available data
      const fetchPromises = Array.from({ length: 7 }, (_, index) => {
        const daysAgo = index + 1;
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        const testDate = d.toISOString().split('T')[0];
        
        return (reports as any).userUsageReport.get({
          userKey: 'all',
          date: testDate,
          parameters: 'accounts:drive_used_quota_in_mb,accounts:total_quota_in_mb',
          maxResults: 500,
        }).then((res: any) => {
          if (res.data && res.data.usageReports && res.data.usageReports.length > 0) {
            return { date: testDate, daysAgo, data: res.data };
          }
          return null;
        }).catch((err: any) => null); // Ignore errors (e.g. 400 No Data) in parallel fetching
      });

      const results = await Promise.all(fetchPromises);
      
      // Find the valid result with the smallest daysAgo (most recent)
      const validResults = results.filter(res => res !== null);
      if (validResults.length > 0) {
        // Sort by daysAgo ascending (most recent first)
        validResults.sort((a, b) => a.daysAgo - b.daysAgo);
        reportData = validResults[0].data;
      }
    }

    if (!reportData) {
      return { success: true, data: [] as StorageUsageEntry[] };
    }

    const entries: StorageUsageEntry[] = (reportData.usageReports || [])
      .filter((report: any) => report.parameters)
      .map((report: any) => {
        const params = report.parameters || [];
        const usedMB = params.find((p: any) => p.name === 'accounts:drive_used_quota_in_mb')?.intValue || '0';
        const totalMB = params.find((p: any) => p.name === 'accounts:total_quota_in_mb')?.intValue || '0';

        return {
          email: report.entity?.userEmail || '',
          usedBytes: parseInt(usedMB) * 1024 * 1024,
          totalBytes: parseInt(totalMB) * 1024 * 1024,
        };
      })
      .filter((e: StorageUsageEntry) => e.email);

    return { success: true, data: entries };
  } catch (error: any) {
    console.error('[Google Workspace] Storage report failed:', error.message);
    if (error.code === 400 || error.message?.includes('Data for dates')) {
      return { success: true, data: [] as StorageUsageEntry[] };
    }
    return { success: false, error: translateError(error) };
  }
  });
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export async function getAuditLogs(
  idToken: string,
  orgId: string,
  
  options?: {
    application?: string
    startTime?: string
    endTime?: string
    maxResults?: number
    eventName?: string
  }

) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail) return { success: false, error: 'Admin email is required.' };

  const cacheKey = `audit-${adminEmail}-${JSON.stringify(options || {})}`;
  return withCache(cacheKey, 120, async () => {
    try {
      const auth = await getAdminClient(adminEmail);
      const reports = google.admin({ version: 'reports_v1', auth });

    const params: any = {
      userKey: 'all',
      applicationName: options?.application || 'admin',
      maxResults: options?.maxResults || 25,
    };

    if (options?.startTime) params.startTime = options.startTime;
    if (options?.endTime) params.endTime = options.endTime;
    if (options?.eventName) params.eventName = options.eventName;

    const res = await (reports as any).activities.list(params);

    const logs = (res.data.items || []).map((item: any) => ({
      id: item.id?.uniqueQualifier || '',
      time: item.id?.time || '',
      actorEmail: item.actor?.email || 'System',
      eventName: item.events?.[0]?.name || 'Unknown',
      eventType: item.events?.[0]?.type || 'Unknown',
      ipAddress: item.ipAddress || '',
      parameters: item.events?.[0]?.parameters?.map((p: any) => ({
        name: p.name,
        value: p.value || p.intValue || p.boolValue || '',
      })) || [],
    }));

    return { success: true, data: logs };
  } catch (error: any) {
    console.error('[Google Workspace] Audit logs failed:', error.message);
    return { success: false, error: translateError(error) };
  }
  });
}

// ─── Security Alerts ────────────────────────────────────────────────────────────

export async function listAlerts(
  idToken: string,
  orgId: string,
  
) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail) return { success: false, error: 'Admin email is required.' };

  return withCache(`alerts-${adminEmail}`, 300, async () => {
  try {
    const credentials = getServiceAccountCredentials();

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/apps.alerts'],
      subject: adminEmail,
    });

    const alertCenter = google.alertcenter({ version: 'v1beta1', auth });

    const res = await alertCenter.alerts.list({
      pageSize: 20,
      orderBy: 'create_time desc',
    });

    const alerts: WorkspaceAlert[] = (res.data.alerts || []).map((a: any) => ({
      alertId: a.alertId || '',
      type: a.type || 'Unknown',
      source: a.source || 'Unknown',
      severity: a.metadata?.severity || 'LOW',
      createTime: a.createTime || '',
      startTime: a.startTime || '',
      endTime: a.endTime || '',
      data: a.data || null,
    }));

    return { success: true, data: alerts };
  } catch (error: any) {
    console.error('[Google Workspace] Alerts failed:', error.message);
    // Alert Center API is beta — graceful fallback
    if (error.code === 403 || error.code === 404) {
      return {
        success: true,
        data: [] as WorkspaceAlert[],
      };
    }
    return { success: false, error: translateError(error) };
  }
  });
}

// ─── User Counts by OU (Optimized) ──────────────────────────────────────────

export async function getUserCountsByOU(
  idToken: string,
  orgId: string,
  
  ouPaths: string[]

) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail) return { success: false, error: 'Admin email is required.' };

  const cacheKey = `counts-${adminEmail}-${ouPaths.join(',')}`;
  return withCache(cacheKey, 120, async () => {
    try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    const counts: Record<string, { total: number; active: number; suspended: number }> = {};

    await Promise.all(ouPaths.map(async (ouPath) => {
      try {
        const listParams: any = {
          customer: 'my_customer',
          maxResults: 500,
          projection: 'basic',
        };
        if (ouPath !== '__all__') {
          listParams.query = `orgUnitPath='${ouPath}'`;
        }
        
        const res = await admin.users.list(listParams);

        const users = res.data.users || [];
        const active = users.filter((u: any) => !u.suspended).length;
        const suspended = users.filter((u: any) => u.suspended).length;

        counts[ouPath] = { total: users.length, active, suspended };
      } catch {
        counts[ouPath] = { total: 0, active: 0, suspended: 0 };
      }
    }));

    return { success: true, data: counts };
  } catch (error: any) {
    console.error('[Google Workspace] User counts failed:', error.message);
    return { success: false, error: translateError(error) };
  }
  });
}

// ─── Suspended Users (for Archive Ledger) ────────────────────────────────────

export async function listSuspendedUsers(
  idToken: string,
  orgId: string,
  
  pageToken?: string

) {
  const adminEmail = await verifyAdminAccess(idToken, orgId);

  if (!adminEmail) return { success: false, error: 'Admin email is required.' };

  try {
    const auth = await getAdminClient(adminEmail);
    const admin = google.admin({ version: 'directory_v1', auth });

    const params: any = {
      customer: 'my_customer',
      query: 'isSuspended=true',
      maxResults: 50,
      projection: 'full',
      orderBy: 'email',
    };

    if (pageToken) params.pageToken = pageToken;

    const res = await admin.users.list(params);

    const users: WorkspaceUser[] = (res.data.users || []).map((u: any) => ({
      id: u.id || '',
      email: u.primaryEmail || '',
      firstName: u.name?.givenName || '',
      lastName: u.name?.familyName || '',
      fullName: u.name?.fullName || '',
      orgUnitPath: u.orgUnitPath || '/',
      suspended: true,
      archived: u.archived || false,
      isAdmin: u.isAdmin || false,
      creationTime: u.creationTime || '',
      lastLoginTime: u.lastLoginTime || '',
      thumbnailPhotoUrl: u.thumbnailPhotoUrl || undefined,
    }));

    return {
      success: true,
      data: {
        users,
        nextPageToken: res.data.nextPageToken || null,
      },
    };
  } catch (error: any) {
    console.error('[Google Workspace] List suspended users failed:', error.message);
    return { success: false, error: translateError(error) };
  }
}
