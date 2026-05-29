
'use server';

import { google } from 'googleapis';

/**
 * @fileOverview Google Workspace Administrator Server Actions
 * Handles API interactions with Google Admin SDK (Directory API).
 * Requires Service Account credentials in environment variables.
 */

// Helper to initialize the Admin SDK client with Domain-Wide Delegation
async function getAdminClient(adminEmail?: string) {
  const saJson = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT;
  
  if (!saJson) {
    throw new Error('Google Workspace Service Account credentials are not configured in environment variables.');
  }

  const credentials = JSON.parse(saJson);
  
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Invalid Google Workspace Service Account configuration.');
  }

  // Domain-wide delegation requires impersonating a super-admin of the target domain
  if (!adminEmail) {
    throw new Error('Institutional administrative email is required for impersonation.');
  }

  const auth = new google.auth.JWT(
    credentials.client_email,
    undefined,
    credentials.private_key.replace(/\\n/g, '\n'), // Ensure newlines are handled correctly
    [
      'https://www.googleapis.com/auth/admin.directory.user',
      'https://www.googleapis.com/auth/admin.directory.orgunit',
      'https://www.googleapis.com/auth/admin.directory.customer.readonly',
      'https://www.googleapis.com/auth/admin.reports.usage.readonly',
    ],
    adminEmail 
  );

  return google.admin({
    version: 'directory_v1',
    auth,
  });
}

/**
 * Directory: Users
 */
export async function listWorkspaceUsers(orgUnitPath: string = '/', adminEmail?: string) {
  try {
    const admin = await getAdminClient(adminEmail);
    const res = await admin.users.list({ 
      customer: 'my_customer', 
      orgUnitPath: orgUnitPath === '/' ? undefined : orgUnitPath,
      maxResults: 500,
      orderBy: 'email'
    });

    return { 
      success: true, 
      data: res.data.users?.map(u => {
        // Calculate storage (approximate based on API metadata if available)
        // Note: Real storage often requires usage reports, but we'll map existing properties
        return {
          id: u.id,
          name: u.name?.fullName || 'Unnamed User',
          email: u.primaryEmail,
          status: u.suspended ? 'Suspended' : 'Active',
          storage: u.agreedToTerms ? 'Monitoring...' : 'Pending', // Real storage is complex via Directory API alone
          archived: u.suspended || false,
          orgUnitPath: u.orgUnitPath || '/'
        };
      }) || []
    };
  } catch (error: any) {
    console.error('[Google Admin Action] List Users Error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function createWorkspaceUser(userData: any, adminEmail?: string) {
  try {
    const admin = await getAdminClient(adminEmail);
    const res = await admin.users.insert({
      requestBody: {
        primaryEmail: userData.email,
        name: { givenName: userData.firstName, familyName: userData.lastName },
        password: userData.password,
        orgUnitPath: userData.orgUnitPath || '/',
        changePasswordAtNextLogin: userData.changePasswordAtNextLogin || false,
      }
    });
    return { success: true, data: res.data };
  } catch (error: any) {
    console.error('[Google Admin Action] Create User Error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function updateWorkspaceUser(userId: string, updateData: any, adminEmail?: string) {
  try {
    const admin = await getAdminClient(adminEmail);
    await admin.users.patch({
      userKey: userId,
      requestBody: {
        name: updateData.name ? { fullName: updateData.name } : undefined,
        primaryEmail: updateData.email,
        orgUnitPath: updateData.orgUnitPath
      }
    });
    return { success: true };
  } catch (error: any) {
    console.error('[Google Admin Action] Update User Error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function resetUserPassword(userId: string, newPassword: string, forceChange: boolean = true, adminEmail?: string) {
  try {
    const admin = await getAdminClient(adminEmail);
    await admin.users.patch({
      userKey: userId,
      requestBody: {
        password: newPassword,
        changePasswordAtNextLogin: forceChange
      }
    });
    return { success: true };
  } catch (error: any) {
    console.error('[Google Admin Action] Password Reset Error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function archiveUser(userId: string, suspend: boolean = true, adminEmail?: string) {
  try {
    const admin = await getAdminClient(adminEmail);
    await admin.users.patch({
      userKey: userId,
      requestBody: { suspended: suspend }
    });
    return { success: true };
  } catch (error: any) {
    console.error('[Google Admin Action] Archive User Error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function deleteWorkspaceUser(userId: string, adminEmail?: string) {
  try {
    const admin = await getAdminClient(adminEmail);
    await admin.users.delete({ userKey: userId });
    return { success: true };
  } catch (error: any) {
    console.error('[Google Admin Action] Delete User Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Directory: Organizational Units
 */
export async function listOrgUnits(adminEmail?: string) {
  try {
    const admin = await getAdminClient(adminEmail);
    const res = await admin.orgunits.list({ customer: 'my_customer', type: 'all' });
    return { success: true, data: res.data.organizationUnits || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Analytics: Customer Settings
 */
export async function getCustomerStorageUsage(adminEmail?: string) {
  try {
    const admin = await getAdminClient(adminEmail);
    const res = await admin.customers.get({ customerKey: 'my_customer' });
    
    // Directory API doesn't give real-time total usage easily without the Reports API,
    // so we return structured placeholder that would normally be aggregated from Reports.
    return { 
      success: true, 
      data: { 
        used: 0.8, // In a full implementation, this comes from Reports API usage queries
        total: 10.0 
      } 
    };
  } catch (error: any) {
    console.error('[Google Admin Action] Customer Info Error:', error.message);
    return { success: false, error: error.message };
  }
}
