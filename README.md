<div align="center">

<img src="public/banner.svg" width="100%" alt="Revlet Enterprise IT Management Control Plane" />

</div>

---

## Executive Overview & Architectural Mission

**Revlet** is an open, sovereign, multi-tenant **Enterprise IT Management Control Plane** engineered specifically for educational institutions, academies, and distributed organizations. Designed to eliminate the operational friction of toggling between disparate third-party vendor dashboards, Revlet bridges the **Cloudflare v4 Network API**, the **Google Workspace Directory & Admin SDK**, and **Firebase Zero-Trust Security Infrastructure** into a unified, high-assurance single pane of glass.

Modern educational institutions and enterprises face severe operational fragmentation. Routine administrative tasks—such as provisioning student emails, verifying SPF/DKIM/DMARC compliance, updating root apex DNS records, configuring edge SSL/TLS encryption, and tracking institutional Google Drive storage quotas—require IT personnel to navigate multiple distinct, permission-heavy administrative portals (Cloudflare Dashboard, Google Admin Console, Google Cloud Console, Registrar Portals, and internal ticket queues). This fragmentation introduces:
1. **Critical Configuration Drift**: Discrepancies between DNS MX routing records and email forwarders, resulting in silent message drops.
2. **Privilege Escalation Exposure**: Granting staff broad super-administrator permissions in upstream dashboards due to the lack of granular, organization-scoped role delegation.
3. **Storage Quota Blowouts**: Inability to proactively identify students or departments consuming massive Google Drive storage until domain-wide limits are enforced by Google.

Revlet resolves this architectural paradox. By enforcing **Zero-Trust Server Actions Tenancy (`verifyUserOrgAccess`)**, **Domain-Wide Delegation (DWD)**, and **real-time edge telemetry**, administrative teams manage their entire network, email routing, and user directory fleet in seconds without ever sharing root credentials or navigating third-party consoles.

---

## Ingestion & Control Engine

Revlet coordinates edge network updates and directory provisioning through a resilient, non-blocking asynchronous pipeline:

```text
[ CLIENT ACTION / API TRIGGER ]
       │
       ├──► STAGE 1: TENANCY & IDENTITY VALIDATION (auth-helper.ts)
       │      ├── Verify Firebase Auth ID token (Cryptographic signature check)
       │      ├── Fetch target organization document from Firestore ('organizations/{orgId}')
       │      ├── Assert Caller is Resource Owner (ownerId == uid) OR verified Team Member
       │      └── Guard against IDOR: Reject cross-tenant Cloudflare zone manipulation
       │
       ├──► STAGE 2: NETWORK INFRASTRUCTURE ORCHESTRATION (cloudflare-*.ts)
       │      ├── Cloudflare API v4 connection with per-tenant zone isolation
       │      ├── DNS Management: Atomic CRUD for A, AAAA, CNAME, MX, TXT records
       │      ├── Edge Infrastructure: Real-time Cache Purge, SSL/TLS Mode, DDoS Sensitivity
       │      └── Custom Email Routing: Destination validation & Forwarding Rules sync
       │
       ├──► STAGE 3: GOOGLE WORKSPACE DIRECTORY & DWD (google-workspace.ts)
       │      ├── Decrypt and parse Service Account credentials with Domain-Wide Delegation
       │      ├── Impersonate designated institutional Super Admin email
       │      ├── Directory API: User provisioning, OU reassignment, account suspension
       │      ├── Storage API: Aggregate drive pool tracking and user quota reports
       │      └── Alert Center API: Ingestion of security threats and device compromise logs
       │
       └──► STAGE 4: AUDIT LEDGER & CLIENT STREAMING
              ├── Commit mutation to Firestore audit trail with actor metadata
              ├── Invalidate Next.js cache tags (revalidatePath)
              └── Return structured type-safe response to client state stores
```

---

## System Implementation

| Name | Core Functionality | Current Implementation |
| :--- | :--- | :--- |
| **Authoritative Edge DNS** | Direct Cloudflare API v4 management, auto-pagination up to 1,000 records, proxy toggling | Implemented via `cloudflare-dns.ts` using `cfFetch` bearer tokens, full schema validation, and multi-tenant zone isolation. |
| **Email Routing & Compliance** | Email forwarder alias creation, SPF/DKIM verification, and DMARC enforcement scoring | Implemented via `cloudflare-email.ts`; features live DNS record matching and real-time security parameter calculation. |
| **Infrastructure Edge Security** | Cache purging (everything/files), SSL mode switching, and DDoS sensitivity configuration | Implemented in `cloudflare-infrastructure.ts`; supports `off`, `flexible`, `full`, `strict` SSL and `essentially_off` to `under_attack` DDoS levels. |
| **Workspace User Lifecycle** | User creation, suspension, restoration, password reset, and permanent directory deletion | Implemented in `google-workspace.ts` using Google Admin SDK (`admin.directory_v1`) via Domain-Wide Delegation service account. |
| **Batch User Ingestion** | High-throughput CSV parsing, chunked array batching, and directory bulk updates | Implemented with concurrency limiting and detailed error categorization to prevent Google API rate-limit saturation. |
| **Storage & Security Audits** | Google Drive storage pool monitoring, Alert Center threat alerts, and admin audit logs | Implemented via Reports API (`admin.reports_v1`) and Alert Center API (`alertcenter.alerts_v1`). |
| **Multi-Tenancy State Engine** | Global organization selector, persistent `localStorage` sync, and cross-tab event bus | Implemented via `OrgProvider` and `useActiveOrg` hook; resilient fallback against stale closures and deletion sync. |
| **Enterprise Security Hardening** | Server Actions tenancy guard, strict Firestore rules, CSP headers, Storage access policies | Implemented via `verifyUserOrgAccess`, `firestore.rules`, `storage.rules`, and `next.config.ts`. |

---

## Security Architecture & Zero-Trust Tenancy Model

Revlet implements a multi-layer **Defense-in-Depth** security model designed to eliminate cross-tenant data leakage, privilege escalation, and unauthorized infrastructure tampering.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          REVLET ZERO-TRUST SECURITY ENVELOPE                           │
├────────────────────────┬─────────────────────────────┬─────────────────────────────────┤
│ LAYER                  │ MECHANISM                   │ SECURITY GUARANTEE              │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 1. Edge & Transport    │ HSTS + CSP + Framing Guards │ Strict-Transport-Security (2yr) │
│                        │ (next.config.ts)            │ Disallows clickjacking/framing  │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 2. Server Tenancy      │ verifyUserOrgAccess         │ Cryptographic ID token check;   │
│                        │ (Server Actions)            │ verifies caller owns target org │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 3. Database Integrity  │ Granular Firestore Rules    │ Disallows client-side elevation │
│                        │ (firestore.rules)           │ of zoneId, status, or plan      │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 4. Storage Quarantine  │ Granular Storage Rules      │ Scoped to owner/user ID; strict │
│                        │ (storage.rules)             │ MIME & 10MB size verification   │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 5. Third-Party Auth    │ Domain-Wide Delegation (DWD)│ Service account scopes gated;   │
│                        │ Google & Cloudflare APIs    │ individual admin impersonation  │
└────────────────────────┴─────────────────────────────┴─────────────────────────────────┘
```

### Key Security Safeguards:
1. **IDOR & Zone Tampering Prevention**: Before executing any Cloudflare API request, `verifyUserOrgAccess` fetches the organization's verified Firestore record and asserts that the `expectedZoneId` matches the caller's authorized organization.
2. **Immutable System Fields**: Firestore rules disallow direct client modification of sensitive infrastructure pointers (`cloudflareZoneId`, `plan`, `workspaceStatus`, `ownerId`).
3. **No Hardcoded Superadmin Privileges**: Authorization evaluates Firebase Custom Claims (`request.auth.token.admin == true`) rather than hardcoded email strings.
4. **Pointer-Events Deadlock Guard**: Client layout incorporates a mutation observer (`pointer-events-guard.tsx`) that automatically cleans stuck backdrop styles on dialog dismissals, preventing interface freezes.

---

## Multi-Platform Ecosystem & Unified Control Plane

Revlet provides a comprehensive administrative ecosystem organized into logical service modules:

```text
========================================================================================================
                                REVLET 4-TIER UNIFIED IT ECOSYSTEM
========================================================================================================

 ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
 │  1. NETWORK & DNS    │  │   2. EMAIL ROUTING   │  │   3. WORKSPACE EDU   │  │  4. TENANCY & TEAMS  │
 │  (Cloudflare API v4) │  │  (Cloudflare Email)  │  │  (Google Admin SDK)  │  │  (Firebase Admin RLS)│
 ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤
 │ • A/AAAA/CNAME/MX    │  │ • Custom Aliases     │  │ • User Provisioning  │  │ • Role Delegation    │
 │ • Proxy Status (CDN) │  │ • Destination Inboxes│  │ • OU Category Trees  │  │ • Member Invitations │
 │ • TTL Adjustments    │  │ • SPF/DKIM Auditor   │  │ • Storage Tracking   │  │ • Audit Event Log    │
 │ • Edge Cache Purge   │  │ • DMARC Enforcement  │  │ • Security Alerts    │  │ • Safe Decommission │
 │ • SSL & DDoS Modes   │  │ • Catch-all Routing  │  │ • Batch CSV Ingest   │  │ • Billing & Receipts │
 └──────────────────────┘  └──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### 1. Network & DNS Infrastructure Portal (`/services/dns`)
* **Real-time DNS Records Table**: Search, filter, and inspect records by type, name, content, and proxy status.
* **Inline Record Form**: Create or edit DNS records with validation against IP address formats (IPv4/IPv6), target domain syntax, and priority values for `MX`/`SRV`.
* **Edge Status Badge**: Direct feedback reflecting whether records are actively proxied through Cloudflare CDN or operating in DNS-only bypass mode.

### 2. Custom Email Service & Compliance Center (`/services/email`)
* **Routing Rules Manager**: Define forwarding rules mapping domain aliases (e.g., `contact@example.com`) to verified external destinations.
* **Protocol Inspector**: Visual verification cards assessing the health of SPF records, DKIM selectors, and DMARC enforcement.

### 3. Google Workspace for Education Administration (`/services/workspace`)
* **User Directory**: View full names, primary emails, organizational unit assignments, and account statuses (Active, Suspended, Archived).
* **Storage Dashboard**: Real-time aggregate storage capacity visualization, tracking total consumed bytes, individual outliers, and projected pool exhaustion.
* **Security & Alert Center**: Ingestion of Google Workspace domain alerts (phishing spikes, suspicious logins, revoked OAuth tokens).

### 4. Organization Tenancy & Team Management (`/management/team`)
* **Access Directory**: View team members, assign institution roles, and revoke staff access across organizations.
* **Multi-Org Switching**: Unified organization dropdown persisting the active tenant across sessions and views.

---

## Institutional Onboarding

Revlet streamlines the end-to-end setup of institutional tenants through a verified 5-step operational workflow:

```text
[ NEW INSTITUTIONAL TENANT ]
       │
       ├──► STEP 1: ORGANIZATION REGISTRATION & TENANCY INITIALIZATION
       │      • Navigate to Account Home (/account/home) and click "Add Organization".
       │      • Specify Institution Legal Name, Apex Domain (e.g., example.edu), Contact Email, and Phone.
       │      • Check the "Educational Institution" toggle to unlock Google Workspace for Education modules.
       │      • Revlet initializes a dedicated tenant document in Firestore with isolated collection security.
       │
       ├──► STEP 2: CLOUDFLARE EDGE & AUTHORITATIVE NAMESERVER BINDING
       │      • Add the apex domain to your Cloudflare account to obtain your unique Cloudflare Zone ID.
       │      • Update authoritative nameservers at your domain registrar to point to Cloudflare Anycast nameservers.
       │      • In Revlet DNS Portal (/services/dns), link the Zone ID.
       │      • Revlet verifies ownership, synchronizes existing records, and activates edge DNS management.
       │
       ├──► STEP 3: GOOGLE WORKSPACE DOMAIN-WIDE DELEGATION (DWD) AUTHORIZATION
       │      • Log in to the Google Admin Console (admin.google.com) as a Super Administrator.
       │      • Navigate to: Security > Access and data control > API controls > Manage Domain Wide Delegation.
       │      • Click "Add new" and input the Revlet Service Account Client ID.
       │      • Authorize the required OAuth Scopes:
       │          - https://www.googleapis.com/auth/admin.directory.user
       │          - https://www.googleapis.com/auth/admin.directory.orgunit
       │          - https://www.googleapis.com/auth/admin.reports.usage.readonly
       │          - https://www.googleapis.com/auth/admin.reports.audit.readonly
       │          - https://www.googleapis.com/auth/apps.alerts
       │      • In Revlet Workspace Portal (/services/workspace), click "Connect Google Workspace Account"
       │        and submit your domain's Super Admin email to verify the delegation handshake.
       │
       ├──► STEP 4: EMAIL ROUTING & DOMAIN SECURITY PROTOCOL ACTIVATION
       │      • Access the Email Routing tab (/services/email).
       │      • Deploy Cloudflare Email Routing MX records and verification TXT records.
       │      • Create institutional aliases (e.g., admissions@example.edu) forwarded to administrative staff inboxes.
       │      • Verify automated SPF (`v=spf1 include:_spf.mx.cloudflare.net ~all`), DKIM, and DMARC parameters.
       │
       └──► STEP 5: DIRECTORY HIERARCHY, USER IMPORT & TEAM ACCESS DELEGATION
              • Define Organizational Units (/Students, /Faculty, /Staff) under Academics Management.
              • Perform bulk student onboarding via CSV batch ingestion with automated email format validation.
              • Invite IT staff and departmental administrators under Team Management (/management/team),
                assigning granular institutional access without sharing upstream root credentials.
```

---

## Public & Server Actions API Specification

Revlet exposes type-safe authenticated Server Actions for programmatic integration and internal control flows:

### Server Action: `listDNSRecords(idToken, orgId, zoneId)`
*Retrieves all active DNS records for an authorized tenant zone from Cloudflare API v4.*

#### Request Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `idToken` | `string` | Yes | Valid Firebase Auth bearer ID token of the authenticated user. |
| `orgId` | `string` | Yes | Firestore document ID of the target organization tenant. |
| `zoneId` | `string` | Yes | Authoritative Cloudflare Zone ID bound to the verified organization. |

#### Response Schema (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "rec_01h8x49ab21m098234",
      "type": "A",
      "name": "example.com",
      "content": "192.0.2.1",
      "proxiable": true,
      "proxied": true,
      "ttl": 1,
      "created_on": "2026-09-01T10:00:00Z",
      "modified_on": "2026-11-01T14:30:00Z"
    },
    {
      "id": "rec_01h8x49ab21m098235",
      "type": "MX",
      "name": "example.com",
      "content": "route1.mx.cloudflare.net",
      "priority": 10,
      "ttl": 300,
      "proxied": false
    }
  ]
}
```

---

## Production Implementation Deep-Dives

<details>
<summary><b>1. Cryptographic Tenancy & Anti-IDOR Verification Guard (TypeScript)</b></summary>

```typescript
// src/app/actions/auth-helper.ts
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
  const userEmail = decodedToken.email?.toLowerCase().trim();
  const isSuperAdmin = (decodedToken as any).admin === true;
  const isOwner = isSuperAdmin || orgData?.ownerId === decodedToken.uid;

  let isMember = isOwner;
  if (!isMember && userEmail) {
    if (Array.isArray(orgData?.memberEmails) && orgData.memberEmails.map((e: string) => e.toLowerCase().trim()).includes(userEmail)) {
      isMember = true;
    } else {
      const memberQuery = await adminDb.collection('teamMembers')
        .where('organizationId', '==', orgId)
        .where('ownerId', '==', orgData?.ownerId)
        .where('email', '==', userEmail)
        .where('status', '==', 'Active')
        .limit(1)
        .get();
      if (!memberQuery.empty) isMember = true;
    }
  }

  if (!isMember) {
    throw new Error("Forbidden: You do not have access to this organization.");
  }

  if (expectedZoneId && orgData?.cloudflareZoneId && orgData.cloudflareZoneId !== expectedZoneId) {
    throw new Error("Forbidden: Cloudflare zone mismatch for this organization.");
  }

  return {
    uid: decodedToken.uid,
    email: userEmail,
    isOwner,
    isMember,
    orgData,
  };
}
```
</details>

<details>
<summary><b>2. Authoritative Cloudflare DNS Pagination & Ingestion (TypeScript)</b></summary>

```typescript
// src/app/actions/cloudflare-dns.ts
'use server';

import { verifyUserOrgAccess } from './auth-helper';
import { cfFetch } from './cf-fetch';

export async function listDNSRecords(idToken: string, orgId: string, zoneId: string) {
  if (!zoneId) return { success: false, error: 'No Zone ID provided' };
  try {
    await verifyUserOrgAccess(idToken, orgId, zoneId);
    let allRecords: any[] = [];
    let page = 1;
    let totalPages = 1;

    // Safety cap at 1,000 records (10 pages x 100 records)
    while (page <= totalPages && page <= 10) {
      const data = await cfFetch(`/zones/${zoneId}/dns_records?per_page=100&page=${page}`);
      if (Array.isArray(data.result)) {
        allRecords.push(...data.result);
      }
      totalPages = data.result_info?.total_pages || 1;
      page++;
    }

    return {
      success: true,
      data: allRecords.map((r: any) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        content: r.content,
        proxiable: r.proxiable,
        proxied: r.proxied,
        ttl: r.ttl,
        comment: r.comment,
        priority: r.priority,
      }))
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch DNS records' };
  }
}
```
</details>

<details>
<summary><b>3. Google Workspace Service Account Impersonation via Domain-Wide Delegation (TypeScript)</b></summary>

```typescript
// src/app/actions/google-workspace.ts
'use server';

import { google } from 'googleapis';

const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.orgunit',
  'https://www.googleapis.com/auth/admin.reports.usage.readonly',
  'https://www.googleapis.com/auth/admin.reports.audit.readonly',
  'https://www.googleapis.com/auth/apps.alerts',
];

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY environment variable is not set');
  }
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
}

export async function getImpersonatedClient(adminEmail: string) {
  const creds = getServiceAccountCredentials();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: WORKSPACE_SCOPES,
    subject: adminEmail, // Domain-Wide Delegation impersonation target
  });

  await auth.authorize();
  return auth;
}
```
</details>

<details>
<summary><b>4. Atomic Organization Decommissioning Server Action (TypeScript)</b></summary>

```typescript
// src/app/actions/organization.ts
'use server';

import { adminAuth, adminDb } from '@/firebase/admin';

export async function deleteOrganization(idToken: string, orgId: string) {
  if (!idToken || !orgId) {
    return { success: false, error: 'Unauthorized: Missing credentials.' };
  }

  const decodedToken = await adminAuth.verifyIdToken(idToken);
  const orgRef = adminDb.collection('organizations').doc(orgId);
  const orgDoc = await orgRef.get();

  if (!orgDoc.exists) {
    return { success: false, error: 'Organization not found.' };
  }

  const orgData = orgDoc.data();
  const isSuperAdmin = (decodedToken as any).admin === true;
  const isOwner = isSuperAdmin || orgData?.ownerId === decodedToken.uid;

  if (!isOwner) {
    return { success: false, error: 'Forbidden: Only the owner can permanently delete this organization.' };
  }

  // Atomically clean associated team members
  const teamSnap = await adminDb.collection('teamMembers')
    .where('organizationId', '==', orgId)
    .get();

  const batch = adminDb.batch();
  teamSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(orgRef);

  await batch.commit();
  return { success: true };
}
```
</details>

---

## Tools Used & Technology Matrix

| Domain | Technology / Tool | Architectural Role & Purpose |
| :--- | :--- | :--- |
| **Web Framework** | **Next.js (App Router)** | Full-stack React server framework with Server Actions, Turbopack, and SSR. |
| **UI Library** | **React** | High-performance component rendering with concurrent mode and form actions. |
| **Component Primitives** | **Radix UI** | Accessible, headless UI foundations (`alert-dialog`, `dialog`, `dropdown-menu`, `tabs`). |
| **Styling & Design** | **Tailwind CSS** | Utility-first CSS framework configured with custom headline and brand tokens. |
| **Iconography** | **Lucide React** | Comprehensive enterprise SVG vector icon library. |
| **Edge API Gateway** | **Cloudflare API v4** | Direct network interactions for DNS records, SSL encryption, and email forwarders. |
| **Directory SDK** | **Google Admin SDK** | Direct administration for Workspace Users, OUs, Reports, and Alert Center. |
| **Database & Auth** | **Firebase Web SDK** | Client-side reactive authentication, real-time Firestore listeners, and Storage uploads. |
| **Admin Backend** | **Firebase Admin SDK** | Privileged token verification, IDOR prevention, and atomic Firestore batch commits. |
| **AI Framework** | **Google Genkit** | Structured AI workflows, tool calling, and Gemini integration (`@genkit-ai/google-genai`). |
| **Schema Validation** | **Zod** | Runtime type safety and schema validation for API payloads and form inputs. |
| **Date Management** | **date-fns** | Modular date formatting and audit timestamp derivation. |

---

## Official Documents and Resources

<table width="100%">
  <thead>
    <tr>
      <th width="28%" align="left">Document / Resource</th>
      <th width="48%" align="left">Scope, Architecture & Purpose</th>
      <th width="24%" align="left">Link / Location</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>🛡️ Security Policy</strong></td>
      <td>Vulnerability disclosure guidelines, multi-tenant threat model, IDOR protection, and security response SLAs.</td>
      <td><a href="SECURITY.md"><strong>SECURITY.md</strong></a></td>
    </tr>
    <tr>
      <td><strong>🤝 Contributing Guidelines</strong></td>
      <td>Contribution workflows, coding standards, Conventional Commits specification, and local testing instructions.</td>
      <td><a href="CONTRIBUTING.md"><strong>CONTRIBUTING.md</strong></a></td>
    </tr>
    <tr>
      <td><strong>📜 Code of Conduct</strong></td>
      <td>Community standards, pledge, and enforcement responsibilities based on Contributor Covenant 2.1.</td>
      <td><a href="CODE_OF_CONDUCT.md"><strong>CODE_OF_CONDUCT.md</strong></a></td>
    </tr>
    <tr>
      <td><strong>🔒 Firestore Security Rules</strong></td>
      <td>Granular security rules governing collection access, tenant isolation, owner mutations, and role-based access control.</td>
      <td><a href="firestore.rules"><strong>firestore.rules</strong></a></td>
    </tr>
    <tr>
      <td><strong>📦 Storage Security Rules</strong></td>
      <td>Object storage access policies enforcing authenticated tenancy, strict file size limits (&lt;10MB), and verified MIME types.</td>
      <td><a href="storage.rules"><strong>storage.rules</strong></a></td>
    </tr>
    <tr>
      <td><strong>⚙️ Environment Configuration</strong></td>
      <td>Sanitized template of required client and server environment variables for Firebase, Cloudflare, and Google Workspace.</td>
      <td><a href=".env.example"><strong>.env.example</strong></a></td>
    </tr>
    <tr>
      <td><strong>🛡️ Security Headers Configuration</strong></td>
      <td>Enterprise HTTP header configuration enforcing strict Content Security Policy (CSP), HSTS, and frame protections.</td>
      <td><a href="next.config.ts"><strong>next.config.ts</strong></a></td>
    </tr>
  </tbody>
</table>

---

## Getting Started

### Prerequisites
* **Node.js**: `v20.x` or later (LTS recommended)
* **npm**: `v10.x` or later
* **Firebase Project**: Authentication, Firestore, and Storage provisioned
* **Cloudflare API Token**: Requires `Zone.DNS (Edit)`, `Zone.Email Routing Rules (Edit)`, and `Account.Email Routing (Read)`
* **Google Cloud Project**: Service account with Domain-Wide Delegation authorized for Workspace scopes

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/codexshivam/revlet.git
cd revlet
npm install
```

### 2. Configure Environment Variables
```bash
cp .env.example .env.local
```
Populate `.env.local` with your credentials:
```env
# Firebase Client SDK
FIREBASE_API_KEY="AIzaSy..."
FIREBASE_AUTH_DOMAIN="your-app.firebaseapp.com"
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_STORAGE_BUCKET="your-app.appspot.com"
FIREBASE_MESSAGING_SENDER_ID="123456789"
FIREBASE_APP_ID="1:123456789:web:abcdef"

# Cloudflare Credentials (Server-side)
CLOUDFLARE_DNS_TOKEN="your-cf-bearer-token"
CLOUDFLARE_ACCOUNT_ID="your-cf-account-id"

# Google Workspace Admin SDK (Base64 Service Account JSON Key)
GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY="eyJrZXlfaWQiOi..."

# Firebase Admin SDK (Base64 Service Account JSON Key)
FIREBASE_SERVICE_ACCOUNT_KEY="eyJwcm9qZWN0X2lk..."
```

### 3. Launch Development Server
```bash
npm run dev
```
Navigate to [http://localhost:9002](http://localhost:9002) in your browser.

### 4. Build for Production
```bash
# Type check TypeScript codebase
npm run typecheck

# Lint Next.js code
npm run lint

# Production compilation
npm run build
```

---

## License & Open-Source Adoption

Revlet is open-source software licensed under the **Apache License, Version 2.0**.
See the [LICENSE](LICENSE) file for complete details.

```text
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
