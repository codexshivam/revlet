
'use server';

import { google } from 'googleapis';

/**
 * @fileOverview Google Workspace Administrator Server Actions
 * Handles API interactions with Google Admin SDK (Directory API).
 * Requires Service Account credentials in environment variables.
 */

async function getAdminClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT || '{}'),
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.user',
      'https://www.googleapis.com/auth/admin.directory.orgunit',
      'https://www.googleapis.com/auth/admin.directory.customer.readonly',
    ],
  });

  const authClient = await auth.getClient();
  
  // Set the subject (impersonation) if managing a specific customer
  return google.admin({
    version: 'directory_v1',
    auth: authClient as any,
  });
}

export async function listWorkspaceUsers(customerId: string = 'my_customer') {
  try {
    // In a real scenario, we'd use getAdminClient() with domain impersonation
    // For now, we return a structured mock if credentials aren't ready
    if (!process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT) {
       return { 
         success: true, 
         data: [
           { id: '1', name: 'Sagar Poudel', email: 'sagar.poudel@ku.edu.np', status: 'Active', storage: '1.2 GB', archived: false },
           { id: '2', name: 'Rajesh Karki', email: 'rajesh.karki@ku.edu.np', status: 'Active', storage: '4.5 GB', archived: false },
           { id: '3', name: 'Deepika Shrestha', email: 'deepika.s@ku.edu.np', status: 'Archived', storage: '0.8 GB', archived: true }
         ] 
       };
    }
    const admin = await getAdminClient();
    const res = await admin.users.list({ customer: customerId, maxResults: 500 });
    return { 
      success: true, 
      data: res.data.users?.map(u => ({
        id: u.id,
        name: u.name?.fullName,
        email: u.primaryEmail,
        status: u.archived ? 'Archived' : 'Active',
        storage: 'Calculated from reports',
        archived: u.archived || false
      })) || []
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createWorkspaceUser(userData: any) {
  try {
    if (!process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT) return { success: true, data: { id: Date.now() } };
    const admin = await getAdminClient();
    const res = await admin.users.insert({
      requestBody: {
        primaryEmail: userData.email,
        name: { givenName: userData.firstName, familyName: userData.lastName },
        password: userData.password,
        changePasswordAtNextLogin: true,
      }
    });
    return { success: true, data: res.data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateWorkspaceUser(userId: string, updateData: any) {
  try {
    if (!process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT) return { success: true };
    const admin = await getAdminClient();
    await admin.users.patch({
      userKey: userId,
      requestBody: updateData
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteWorkspaceUser(userId: string) {
  try {
    if (!process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT) return { success: true };
    const admin = await getAdminClient();
    await admin.users.delete({ userKey: userId });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function listOrgUnits(customerId: string = 'my_customer') {
  try {
    if (!process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT) {
      return { success: true, data: [{ name: 'Staff', path: '/Staff' }, { name: 'Students', path: '/Students' }] };
    }
    const admin = await getAdminClient();
    const res = await admin.orgunits.list({ customer: customerId });
    return { success: true, data: res.data.organizationUnits || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createOrgUnit(customerId: string = 'my_customer', name: string, parentPath: string = '/') {
  try {
    if (!process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT) return { success: true };
    const admin = await getAdminClient();
    await admin.orgunits.insert({
      customer: customerId,
      requestBody: { name, parentOrgUnitPath: parentPath }
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
