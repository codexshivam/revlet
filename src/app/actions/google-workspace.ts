'use server';

import { google } from 'googleapis';

/**
 * @fileOverview Google Workspace Administrator Server Actions
 * Handles API interactions with Google Admin SDK (Directory API).
 * Uses Domain-Wide Delegation via Service Account.
 */

// Production Service Account JSON provided by the user
const SERVICE_ACCOUNT_KEY = {
  "type": "service_account",
  "project_id": "revlet",
  "private_key_id": "2f71fae0ea3c8ce2296256a47d93e8284dc369d3",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCj8wvbzKDsoE/i\n/JSmtSIn5jpUnn6qRYhcqJoGeSdb1+YitKtmOHANpej2QiymuDPg7PDtp1ZLDHdv\nggWkI7YmrT5j+Odt13k6I9jCLCw3iinaPr2kbN59Q8/E+vVhYsWMMOnK4pv4/DMO\nBHel4SO83/Fcb4luFosi8pFIXdeu0gFSVymomEnhYuKnSmJFEH2BH8VHZ3MWWvF0\nvCkwXYQgoDeRwtteWVmHcN2YIP4dFtflCLCJ9oWJjJZJG+aCD60F6YnqSF6DmmR7\nePz7+utM9zcCV3E8HBRIYmgzrQv+8qbBFST+cdAxKzkN/HxQ7k4/XnJfMD9WNGTX\nRV08RzWPAgMBAAECggEAAuPOMg1fhUEr11CfI9rQqIEn0JkGwlC9hozmuJhCL07o\n0GDLbRnhCK5mGRqsqOPPoHGJDczjue3GXVQUqUxIT42tqkewAdwma2I0c1WX6rQW\nyydggCW7lSqr3pzh+9m8bjrofU3okiTaDWCfyA2NYfuQF01yAQy5/B9yEjcOyO97\nP/xlQyfO7tX4GkG0oVii02Ahk6gZ1Ez4KQgHwXP5KLZOCAgIGxshdwKKQN2Xx+JA\nPKCdqCG3/L8UQLRPGN3i9sTCFi67bG0TsgJyxcwlZvisZ3dE3KzAlyzoHsfRZqdq\nOgVUPD4TGUVFZSYpi1WrJA5GmRf5gXZi2JDSeWUERQKBgQDTSSJclrfh4KFL2m7h\nY7FnpE6oBR/up4tEYyC/1FzWymJhVehWxpKSALKuAgRbqyjMgYsO3k4xyX1rr+O9\nD3cvqqOyuigX/Th4J9eybhlmg04ttOljPokGrUuO1gLXw6paU7+IIhgD3dF4U7y3\nTV8MeHniiwwGtJUha6Juw3BvCwKBgQDGpV14hga1M5GbhfW0Lf9SNKJmTwrIYtZ+\nsV6v3lnq79urjzT2mvaDAE+YoequPPECbGVwV4rPUlB9ZmxgqEVj2rDd5FnGvcai\nWZ2fkCy4DAPhcRiT3w+ZB8e2SxJuMDVtu9KPXGN9hu3NLkyjwZ4864cchORXiuWs\nx7yuLLf2DQKBgBpmkAmbt5xc0irFP4egSmGV8VIjWcsbWlaQQF5X7cXVAhgBgQee\xl/CAJGnpN3DdFShdzvDYWftMmPLVZyhGxZ0rwG9KxdcR7sT12rvQPNDQviJG4SQ\ItUXwFI3waEuTNH+lvcus2uAQxVS+Ui6PT80qp45G6aW1++WIHTQrPLjAoGBAJz7\nK83GJODnuubry0szmnUNcVVmm3/WU+nVI53aGrcGDFQcnN9RgQPvp/dX5c0CDfg7\nT0Kje+fxBfjDi1wrPoL13RXNkoDzkljUdzMUzbI4lIyBQsoA2iO2OUY/N3ZqlJ5+\ncpymh1041w5xy1ER/onoG2MXRhhEhNKxGdOPNWW1AoGBAL5whdNrFplKsD2ODL0s\n9qqA+wwuAwuARe3exKiz0fMyp2ZXr2UHBBBtgll+KY9lf1ClT5kbP4eP7BvQJf6H\n4Mw8gzh6k6ms0A9coU1mimS/HQrI3i43lbk4096eUEW6swqeytTjYcTBoFreqRVN\nkI/TGQCIJ5iBhw/SYp9Vkvav\n-----END PRIVATE KEY-----\n",
  "client_email": "workspace-admin@revlet.iam.gserviceaccount.com",
  "client_id": "105450959878009279492",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/workspace-admin%40revlet.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

// Helper to initialize the Admin SDK client with Domain-Wide Delegation
async function getAdminClient(adminEmail?: string) {
  // Use environment variable if available, otherwise use embedded key
  const saJson = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT;
  const credentials = saJson ? JSON.parse(saJson) : SERVICE_ACCOUNT_KEY;
  
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
        return {
          id: u.id,
          name: u.name?.fullName || 'Unnamed User',
          email: u.primaryEmail,
          status: u.suspended ? 'Suspended' : 'Active',
          storage: u.agreedToTerms ? 'Monitoring...' : 'Pending',
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
    return { 
      success: true, 
      data: { 
        used: 0.8, 
        total: 10.0 
      } 
    };
  } catch (error: any) {
    console.error('[Google Admin Action] Customer Info Error:', error.message);
    return { success: false, error: error.message };
  }
}