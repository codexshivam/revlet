<div align="center">

# 🏢 Revlet
### Enterprise Multi-Tenant IT Management & Cloud Infrastructure Control Plane

[![Next.js](https://img.shields.io/badge/Next.js_15-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare API v4](https://img.shields.io/badge/Cloudflare_API_v4-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/api/)
[![Google Workspace](https://img.shields.io/badge/Google_Workspace_Admin_SDK-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/admin-sdk)
[![Firebase Suite](https://img.shields.io/badge/Firebase_Admin_&_Rules-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

<p align="center">
  <b>Unified orchestration for Cloudflare DNS, Email Routing, Google Workspace for Education, and Institutional Identity.</b><br/>
  Zero-trust tenancy • Server-side Domain-Wide Delegation • Real-time SPF/DKIM/DMARC compliance • Automated lifecycle management
</p>

</div>

---

## Executive Overview & Architectural Mission

**Revlet** is an open, sovereign, multi-tenant **Enterprise IT Management Control Plane** engineered specifically for educational institutions, academies, and distributed organizations. Designed to eliminate the operational friction of toggling between disparate third-party vendor dashboards, Revlet bridges the **Cloudflare v4 Network API**, the **Google Workspace Directory & Admin SDK**, and **Firebase Zero-Trust Security Infrastructure** into a unified, high-assurance single pane of glass.

Modern educational institutions and enterprises face severe operational fragmentation. Routine administrative tasks—such as provisioning student emails, verifying SPF/DKIM/DMARC compliance, updating root apex DNS records, configuring edge SSL/TLS encryption, and tracking institutional Google Drive storage quotas—require IT personnel to navigate up to five distinct, permission-heavy administrative portals (Cloudflare Dashboard, Google Admin Console, Google Cloud Console, Registrar Portals, and internal ticket queues). This fragmentation introduces:
1. **Critical Configuration Drift**: Discrepancies between DNS MX routing records and email forwarders, resulting in silent message drops.
2. **Privilege Escalation Exposure**: Granting staff broad super-administrator permissions in upstream dashboards due to the lack of granular, organization-scoped role delegation.
3. **Storage Quota Blowouts**: Inability to proactively identify students or departments consuming terabytes of Google Drive storage until domain-wide limits are enforced by Google.

```text
========================================================================================================================
                          THE FRAGMENTED IT DASHBOARD PARADOX VS. REVLET UNIFIED CONTROL
========================================================================================================================

TIMELINE           Step 1: Domain Setup   Step 2: DNS Config     Step 3: Email Routing  Step 4: Workspace OU   Step 5: Audit
                   │                      │                      │                      │                      │
TRADITIONAL        ├── Registrar Login ───┼── Cloudflare Dash ───┼── DNS TXT/MX Config ─┼── Google Admin Login ┼── Manual CSV
FRAGMENTED         │   (Buy Domain)       │   (Change NS)        │   (Verify SPF/DKIM)  │   (Create Users)     │   Audit Logs
MANAGEMENT         │   30 mins            │   45 mins            │   2 hours            │   1 hour             │   Half-Day Work
                   │   Separate Accounts  │   Shared Password    │   Syntax Typos       │   Broad SuperAdmin   │   Audit Gaps
                   │   & 2FA Tokens       │   Risk Exposure      │   Silent Email Drops │   Privilege Leak     │   No Central View
                   │                      │                      │                      │                      │
───────────────────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────
REVLET             │ ZERO-TOUCH REG       │ INSTANT CF SYNC      │ REAL-TIME AUDITOR    │ 1-CLICK PROVISION    │ CONSOLIDATED
UNIFIED            │ Authenticated Org    │ Edge TTL & Proxy     │ Automated SPF/DKIM   │ Domain-Wide Deleg.   │ Centralized Logs
CONTROL PLANE      │ Tenant Isolation     │ Immediate Deploy     │ Validation Formula   │ Batch CSV Ingestion  │ & Drive Alerts
                   │ (1 Single Session)   │ (Sub-Second API)     │ (Security Vector)    │ (Automated Sync)     │ (Instant Visibility)
========================================================================================================================
```

Revlet resolves this architectural paradox. By enforcing **Zero-Trust Server Actions Tenancy (`verifyUserOrgAccess`)**, **Domain-Wide Delegation (DWD)**, and **real-time edge telemetry**, administrative teams manage their entire network, email routing, and user directory fleet in seconds without ever sharing root credentials or navigating third-party consoles.

---

## 1. Core Engineering & Mathematical Foundations

Revlet synthesizes network metrics, cryptographic authentications, and directory telemetry into deterministic models governed by mathematical formulations of caching, queue saturation, and security vectors.

### 1.1 DNS Propagation Probability & Cache Expiration Dynamics

When updating authoritative edge DNS records (`A`, `AAAA`, `CNAME`, `MX`, `TXT`) across Cloudflare Anycast nodes, global resolver cache propagation is modeled as an exponential decay function parameterized by the record's Time-To-Live ($\text{TTL}$):

$$\text{PropagationProbability}(t) = 1.0 - \exp\left( - \frac{t \cdot \ln(2)}{\tau_{\text{half-life}}} \right) \quad \text{where} \quad \tau_{\text{half-life}} = \frac{\text{TTL}}{2}$$

For records deployed with Cloudflare Auto-TTL ($\text{TTL} = 1$, corresponding to 300 seconds on edge resolvers):

$$\tau_{\text{half-life}} = 150\,\text{seconds}$$

The percentage of global recursive resolvers reflecting the new record state at elapsed time $t$ is computed deterministically:

$$P(t) = \begin{cases}
0.0 & \text{if } t < 0 \\
1.0 - 2^{-2t / \text{TTL}} & \text{if } t \ge 0
\end{cases}$$

### 1.2 Composite Email Authentication Trust Vector ($S_{\text{Email}}$)

To protect institutional domains against spoofing, phishing, and CEO fraud, Revlet evaluates the domain's email posture using a weighted multi-protocol trust formula:

$$S_{\text{Email}} = \min\left(100.0,\; 100.0 \cdot \Big( w_{\text{SPF}} \cdot I_{\text{SPF}} + w_{\text{DKIM}} \cdot I_{\text{DKIM}} + w_{\text{DMARC}} \cdot I_{\text{DMARC}} \cdot (1.0 + \delta_{\text{policy}}) \Big)\right)$$

Where:
* $I_{\text{SPF}} \in \{0.0, 1.0\}$: Binary indicator of authoritative SPF record containing valid include mechanisms (`v=spf1 include:_spf.mx.cloudflare.net ~all`).
* $I_{\text{DKIM}} \in \{0.0, 1.0\}$: Cryptographic DKIM key presence and public selector verification via DNS `TXT` / `CNAME`.
* $I_{\text{DMARC}} \in \{0.0, 1.0\}$: DMARC policy record presence at `_dmarc.example.com`.
* $\delta_{\text{policy}}$: Enforcement policy multiplier:
  * $\delta = 0.00$ for `p=none` (Monitoring mode only).
  * $\delta = 0.15$ for `p=quarantine` (Suspicious mail quarantined).
  * $\delta = 0.25$ for `p=reject` (Strict rejection of unauthenticated payloads).
* Default protocol weights: $w_{\text{SPF}} = 0.30$, $w_{\text{DKIM}} = 0.35$, $w_{\text{DMARC}} = 0.35$.

### 1.3 Institutional Storage Quota Saturation & Anomaly Metric

In Google Workspace for Education domains, pooled institutional storage is monitored to preempt service throttling. For a tenant with pooled capacity $C_{\text{pool}}$ and $N$ active directory users, aggregate saturation ($U_{\text{domain}}$) and user consumption variance ($\sigma_{\text{storage}}$) are derived as:

$$U_{\text{domain}} = \left( \frac{\sum_{i=1}^{N} u_i}{C_{\text{pool}}} \right) \times 100\%$$

$$\mu_{\text{storage}} = \frac{1}{N} \sum_{i=1}^{N} u_i, \qquad \sigma_{\text{storage}} = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (u_i - \mu_{\text{storage}})^2}$$

An institutional user $k$ is flagged as an **Abnormal Resource Consumer (Outlier)** if their consumption $u_k$ breaches the standard score threshold:

$$Z_k = \frac{u_k - \mu_{\text{storage}}}{\sigma_{\text{storage}}} \ge +3.00 \quad \text{and} \quad u_k \ge 15.0\,\text{GB}$$

---

## 2. Worked Real-World Scenario: Apex Institute of Technology

To demonstrate operational flow and mathematical execution, consider **Apex Institute of Technology** (`apex.edu`), an educational institution managing 1,200 student accounts, 150 faculty accounts, and Cloudflare-managed edge DNS:

### 2.1 Baseline Organization Parameters
* **Tenant Name:** Apex Institute of Technology
* **Domain:** `apex.edu` (Cloudflare Zone ID: `cf_zone_98a72b14c3e890`)
* **User Count:** $N = 1,350$ active accounts
* **Pooled Google Workspace Drive Limit:** $C_{\text{pool}} = 100.0\,\text{TB} = 102,400.0\,\text{GB}$

### 2.2 Step-by-Step Execution & Derivations

#### Step 1: Authoritative Cloudflare DNS Ingestion
Revlet queries Cloudflare API v4 through authenticated server actions:
* Fetched 18 DNS records (`A`, `CNAME`, `MX`, `TXT`, `SRV`).
* Root Apex Record: `apex.edu` $\to$ Edge Proxy IP `192.0.2.1` (`proxied: true`, $\text{TTL} = 1$).
* Propagation probability at $t = 180\,\text{seconds}$ post-deployment:
  $$P(180) = 1.0 - 2^{-2(180) / 300} = 1.0 - 2^{-1.2} = 1.0 - 0.435 = \mathbf{56.5\% \text{ Global Propagation}}$$
  At $t = 600\,\text{seconds}$ (10 minutes):
  $$P(600) = 1.0 - 2^{-4.0} = 1.0 - 0.0625 = \mathbf{93.75\% \text{ Global Propagation}}$$

#### Step 2: Email Routing & DMARC Audit Calculation
* **SPF Record:** `v=spf1 include:_spf.mx.cloudflare.net ~all` $\implies I_{\text{SPF}} = 1.0$
* **DKIM Record:** Configured with 2048-bit selector $\implies I_{\text{DKIM}} = 1.0$
* **DMARC Record:** `v=DMARC1; p=reject; rua=mailto:dmarc@apex.edu` $\implies I_{\text{DMARC}} = 1.0, \; \delta = 0.25$
* **Trust Vector Calculation:**
  $$
  \begin{aligned}
  S_{\text{Email}} &= 100.0 \cdot \Big( (0.30 \cdot 1.0) + (0.35 \cdot 1.0) + 0.35 \cdot 1.0 \cdot (1.0 + 0.25) \Big) \\
  &= 100.0 \cdot (0.30 + 0.35 + 0.4375) = 100.0 \cdot (1.0875) \implies \text{clamped to } \mathbf{100.0 / 100} \text{ (GRADE: OPTIMAL)}
  \end{aligned}
  $$

#### Step 3: Google Workspace Storage Telemetry & Outlier Detection
* Aggregate consumption across domain: $\sum u_i = 42,800.0\,\text{GB}$
* Domain Saturation:
  $$U_{\text{domain}} = \left(\frac{42,800.0}{102,400.0}\right) \times 100\% = \mathbf{41.80\% \text{ (HEALTHY)}}$$
* Mean user consumption: $\mu = 31.70\,\text{GB}$, Standard Deviation: $\sigma = 18.40\,\text{GB}$
* Outlier Detection for student account `cadet.research@apex.edu` ($u_k = 98.2\,\text{GB}$):
  $$Z_k = \frac{98.2 - 31.7}{18.4} = \frac{66.5}{18.4} = \mathbf{+3.61}$$
  *Action Triggered:* Account flagged in Revlet Storage Portal; automatic warning notification scheduled before Google enforces tenant-wide quota freezes.

---

## 3. Multi-Pillar Ingestion & Control Engine

Revlet coordinates edge network updates and directory provisioning through a resilient, non-blocking asynchronous pipeline:

```text
[ CLIENT ACTION / API TRIGGER ]
       │
       ├──► PILLAR 1: TENANCY & IDENTITY VALIDATION (auth-helper.ts)
       │      ├── Verify Firebase Auth ID token (Cryptographic signature check)
       │      ├── Fetch target organization document from Firestore ('organizations/{orgId}')
       │      ├── Assert Caller is Resource Owner (ownerId == uid) OR verified Team Member
       │      └── Guard against IDOR: Reject cross-tenant Cloudflare zone manipulation
       │
       ├──► PILLAR 2: NETWORK INFRASTRUCTURE ORCHESTRATION (cloudflare-*.ts)
       │      ├── Cloudflare API v4 connection with per-tenant zone isolation
       │      ├── DNS Management: Atomic CRUD for A, AAAA, CNAME, MX, TXT records
       │      ├── Edge Infrastructure: Real-time Cache Purge, SSL/TLS Mode, DDoS Sensitivity
       │      └── Custom Email Routing: Destination validation & Forwarding Rules sync
       │
       ├──► PILLAR 3: GOOGLE WORKSPACE DIRECTORY & DWD (google-workspace.ts)
       │      ├── Decrypt and parse Service Account credentials with Domain-Wide Delegation
       │      ├── Impersonate designated institutional Super Admin email
       │      ├── Directory API: User provisioning, OU reassignment, account suspension
       │      ├── Storage API: Aggregate drive pool tracking and user quota reports
       │      └── Alert Center API: Ingestion of security threats and device compromise logs
       │
       └──► PILLAR 4: AUDIT LEDGER & CLIENT STREAMING
              ├── Commit mutation to Firestore audit trail with actor metadata
              ├── Invalidate Next.js cache tags (`revalidatePath`)
              └── Return structured type-safe response to client state stores
```

---

## 4. System Implementation Status & Pillar Readiness

The operational deployment status across all functional subsystems is summarized below:

| Architectural Pillar | Core Functionality | Status | Current Implementation Details |
| :--- | :--- | :--- | :--- |
| **Pillar 1: Authoritative Edge DNS** | Direct Cloudflare API v4 management, auto-pagination up to 1,000 records, proxy toggling | **Live / Verified** | Implemented via `cloudflare-dns.ts` using `cfFetch` bearer tokens, full schema validation, and multi-tenant zone isolation. |
| **Pillar 2: Email Routing & Compliance** | Email forwarder alias creation, SPF/DKIM verification, and DMARC enforcement scoring | **Live / Verified** | Implemented via `cloudflare-email.ts`; features live DNS record matching and real-time security parameter calculation. |
| **Pillar 3: Infrastructure Edge Security** | Cache purging (everything/files), SSL mode switching, and DDoS sensitivity configuration | **Live / Verified** | Implemented in `cloudflare-infrastructure.ts`; supports `off`, `flexible`, `full`, `strict` SSL and `essentially_off` to `under_attack` DDoS levels. |
| **Pillar 4: Workspace User Lifecycle** | User creation, suspension, restoration, password reset, and permanent directory deletion | **Live / Verified** | Implemented in `google-workspace.ts` using Google Admin SDK (`admin.directory_v1`) via Domain-Wide Delegation service account. |
| **Pillar 5: Batch User Ingestion** | High-throughput CSV parsing, chunked array batching, and directory bulk updates | **Live / Verified** | Implemented with concurrency limiting and detailed error categorization to prevent Google API rate-limit saturation. |
| **Pillar 6: Storage & Security Audits** | Google Drive storage pool monitoring, Alert Center threat alerts, and admin audit logs | **Live / Verified** | Implemented via Reports API (`admin.reports_v1`) and Alert Center API (`alertcenter.alerts_v1`). |
| **Pillar 7: Multi-Tenancy State Engine** | Global organization selector, persistent `localStorage` sync, and cross-tab event bus | **Live / Verified** | Implemented via `OrgProvider` and `useActiveOrg` hook; resilient fallback against stale closures and deletion sync. |
| **Pillar 8: Enterprise Security Hardening** | Server Actions tenancy guard, strict Firestore rules, CSP headers, Storage access policies | **Live / Verified** | Implemented via `verifyUserOrgAccess`, `firestore.rules`, `storage.rules`, and `next.config.ts`. |

---

## 5. Security Architecture & Zero-Trust Tenancy Model

Revlet implements a multi-layer **Defense-in-Depth** security model designed to eliminate cross-tenant data leakage, privilege escalation, and unauthorized infrastructure tampering.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          REVLET ZERO-TRUST SECURITY ENVELOPE                           │
├────────────────────────┬─────────────────────────────┬─────────────────────────────────┤
│ LAYER                  │ MECHANISM                   │ SECURITY GUARANTEE              │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 1. Edge & Transport    │ HSTS + CSP + Framing Guards │ Strict-Transport-Security (2yr) │
│                        │ (`next.config.ts`)          │ Disallows clickjacking/framing  │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 2. Server Tenancy      │ `verifyUserOrgAccess`       │ Cryptographic ID token check;   │
│                        │ (Server Actions)            │ verifies caller owns target org │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 3. Database Integrity  │ Granular Firestore Rules    │ Disallows client-side elevation │
│                        │ (`firestore.rules`)         │ of zoneId, status, or plan      │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 4. Storage Quarantine  │ Granular Storage Rules      │ Scoped to owner/user ID; strict │
│                        │ (`storage.rules`)           │ MIME & 10MB size verification   │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 5. Third-Party Auth    │ Domain-Wide Delegation (DWD)│ Service account scopes gated;   │
│                        │ Google & Cloudflare APIs    │ individual admin impersonation  │
└────────────────────────┴─────────────────────────────┴─────────────────────────────────┘
```

### Key Security Safeguards:
1. **IDOR & Zone Tampering Prevention**: Before executing any Cloudflare API request, `verifyUserOrgAccess` fetches the organization's verified Firestore record and asserts that the `expectedZoneId` mathematically matches the caller's authorized organization.
2. **Immutable System Fields**: Firestore rules disallow direct client modification of sensitive infrastructure pointers (`cloudflareZoneId`, `plan`, `workspaceStatus`, `ownerId`).
3. **No Hardcoded Superadmin Privileges**: Authorization evaluates Firebase Custom Claims (`request.auth.token.admin == true`) rather than hardcoded email strings.
4. **Pointer-Events Deadlock Guard**: Client layout incorporates a mutation observer (`pointer-events-guard.tsx`) that automatically cleans stuck backdrop styles on dialog dismissals, preventing interface freezes.

---

## 6. Multi-Platform Ecosystem & Unified Control Plane

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

### 6.1 Network & DNS Infrastructure Portal (`/services/dns`)
* **Real-time DNS Records Table**: Search, filter, and inspect records by type, name, content, and proxy status.
* **Inline Record Form**: Create or edit DNS records with validation against IP address formats (IPv4/IPv6), target domain syntax, and priority values for `MX`/`SRV`.
* **Edge Status Badge**: Direct feedback reflecting whether records are actively proxied through Cloudflare CDN or operating in DNS-only bypass mode.

### 6.2 Custom Email Service & Compliance Center (`/services/email`)
* **Routing Rules Manager**: Define forwarding rules mapping domain aliases (e.g., `admissions@apex.edu`) to verified external destinations.
* **Protocol Inspector**: Visual verification cards assessing the health of SPF records, DKIM selectors, and DMARC enforcement.

### 6.3 Google Workspace for Education Administration (`/services/workspace`)
* **User Directory**: View full names, primary emails, organizational unit assignments, and account statuses (Active, Suspended, Archived).
* **Storage Dashboard**: Real-time aggregate storage capacity visualization, tracking total consumed bytes, individual outliers, and projected pool exhaustion.
* **Security & Alert Center**: Ingestion of Google Workspace domain alerts (phishing spikes, suspicious logins, revoked OAuth tokens).

---

## 7. Institutional Onboarding & Administrative Hierarchy

Revlet enables rapid onboarding of new institutions through a structured 3-step setup process:

```text
[ EDUCATIONAL INSTITUTION ]
        │
        ├──► STEP 1: ORGANIZATION REGISTRATION (/account/home)
        │       │    Define Name, Domain (e.g. apex.edu), Contact Email, and Educational Flag
        │       │
        │       └──► STEP 2: CLOUDFLARE EDGE BINDING (/services/dns)
        │               │    Provide Cloudflare Zone ID; verify nameserver delegation
        │               │
        │               └──► STEP 3: GOOGLE WORKSPACE DELEGATION (/services/workspace)
        │                       Authorize Service Account Client ID in Google Admin Console:
        │                       • https://www.googleapis.com/auth/admin.directory.user
        │                       • https://www.googleapis.com/auth/admin.directory.orgunit
        │                       • https://www.googleapis.com/auth/admin.reports.usage.readonly
        │                       • https://www.googleapis.com/auth/apps.alerts
```

---

## 8. Public & Server Actions API Specification

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
      "name": "apex.edu",
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
      "name": "apex.edu",
      "content": "route1.mx.cloudflare.net",
      "priority": 10,
      "ttl": 300,
      "proxied": false
    }
  ]
}
```

---

## 9. Operational Economics & Cost Estimation

Revlet dramatically optimizes administrative overhead and eliminates multi-vendor SaaS subscription redundancy:

| Infrastructure & SaaS Category | Fragmented Commercial Model | Revlet Unified Architecture | Efficiency Basis & Savings |
| :--- | :--- | :--- | :--- |
| **DNS & Edge Infrastructure** | Third-party enterprise management suites (\$150–\$300/mo) | Direct Cloudflare API v4 integration | Zero added middleware cost; leverages native Cloudflare free/pro tiers. |
| **Workspace Management Tools** | Commercial directory sync add-ons (\$2–\$5/user/yr) | Native Google Admin SDK via Domain-Wide Delegation | **100% elimination** of external per-seat workspace management licensing. |
| **Email Forwarding Gateways** | Dedicated email forwarding services (\$20–\$50/mo) | Cloudflare Email Routing Integration | Zero third-party mail proxy costs; direct edge routing. |
| **Multi-Tenant Database** | High-cost proprietary relational licensing | Cloud Firestore + Server Actions | Pay-per-read/write serverless pricing with zero idle capacity fees. |
| **Hosting & Compute** | Multiple VPS / Container clusters | Next.js 15 on Serverless / Node Runtime | Highly scalable, event-driven compute with sub-second execution. |

### Projected Monthly Infrastructure Breakdown

*Estimated operational run-rate for an institution with up to 5 organizations and 5,000 active users is projected at **under \$45 USD / month**:*

| Component | Resource Allocation | Estimated Monthly Cost | Notes |
| :--- | :--- | :--- | :--- |
| **Next.js Compute Runtime** | Node.js Serverless / Container | \$15.00 | Handles API routes, Server Actions, and SSR rendering. |
| **Firebase Firestore** | Serverless document operations | \$10.00 | Multi-tenant organization records, team memberships, and audit logs. |
| **Firebase Authentication** | Identity Provider (Google, Email) | \$0.00 | Free tier covers up to 50,000 monthly active users. |
| **Firebase Storage** | Payment vouchers & document assets | \$5.00 | Secure, authenticated object storage. |
| **Cloudflare Edge APIs** | Cloudflare Free/Pro Zone Plan | \$0.00 – \$15.00 | Authoritative DNS, Email Routing, and Edge Rules. |
| **Google Admin SDK Feeds** | Domain-Wide Delegation API calls | \$0.00 | Included within Google Workspace for Education domain quota. |
| **Total Projected Cost** | **Revlet Unified Control Stack** | **~ \$30.00 – \$45.00 / month** | **Over 85% savings compared to legacy enterprise IT portals.** |

---

## 10. Production Implementation Deep-Dives

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

## 11. Tools Used & Technology Matrix

| Domain | Technology / Tool | Version / Spec | Architectural Role & Purpose |
| :--- | :--- | :--- | :--- |
| **Web Framework** | **Next.js 15 (App Router)** | `v15.5.29` | Full-stack React server framework with Server Actions, Turbopack, and SSR. |
| **UI Library** | **React 19** | `v19.3.1` | High-performance component rendering with concurrent mode and form actions. |
| **Component Primitives** | **Radix UI** | Latest Primitives | Accessible, headless UI foundations (`alert-dialog`, `dialog`, `dropdown-menu`, `tabs`). |
| **Styling & Design** | **Tailwind CSS** | `v3.4.1` | Utility-first CSS framework configured with custom headline and brand tokens. |
| **Iconography** | **Lucide React** | `v0.475.0` | Comprehensive enterprise SVG vector icon library. |
| **Edge API Gateway** | **Cloudflare API v4** | REST v4 | Direct network interactions for DNS records, SSL encryption, and email forwarders. |
| **Directory SDK** | **Google Admin SDK** | `googleapis v173` | Direct administration for Workspace Users, OUs, Reports, and Alert Center. |
| **Database & Auth** | **Firebase Web SDK** | `v11.9.1` | Client-side reactive authentication, real-time Firestore listeners, and Storage uploads. |
| **Admin Backend** | **Firebase Admin SDK** | Server-side Node | Privileged token verification, IDOR prevention, and atomic Firestore batch commits. |
| **AI Framework** | **Google Genkit** | `v1.28.0` | Structured AI workflows, tool calling, and Gemini integration (`@genkit-ai/google-genai`). |
| **Schema Validation** | **Zod** | `v4.6.7` | Runtime type safety and schema validation for API payloads and form inputs. |
| **Date Management** | **date-fns** | `v3.6.0` | Modular date formatting and audit timestamp derivation. |

---

## 12. Official Documents and Resources

<table width="100%">
  <thead>
    <tr>
      <th width="24%" align="left">Document / Resource</th>
      <th width="42%" align="left">Scope, Architecture & Purpose</th>
      <th width="18%" align="left">Standard / Environment</th>
      <th width="16%" align="left">Link / Location</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>🌐 Production Repository</strong></td>
      <td>Complete production codebase containing Next.js 15 App Router, Cloudflare actions, Google Workspace Admin SDK integration, and security rules.</td>
      <td><code>Open Source System</code><br/>Next.js 15 + TypeScript</td>
      <td><a href="https://github.com/codexshivam/revlet"><strong>GitHub Repo ↗</strong></a></td>
    </tr>
    <tr>
      <td><strong>🔒 Firestore Security Rules</strong></td>
      <td>Granular security rules governing collection access, tenant isolation, owner mutations, and role-based access control.</td>
      <td><code>Firestore Rules</code><br/>CEL Syntax</td>
      <td><a href="firestore.rules"><strong>firestore.rules</strong></a></td>
    </tr>
    <tr>
      <td><strong>📦 Storage Security Rules</strong></td>
      <td>Object storage access policies enforcing authenticated tenancy, strict file size limits (&lt;10MB), and verified MIME types.</td>
      <td><code>Storage Rules</code><br/>Firebase Security</td>
      <td><a href="storage.rules"><strong>storage.rules</strong></a></td>
    </tr>
    <tr>
      <td><strong>⚙️ Environment Configuration</strong></td>
      <td>Sanitized template of required client and server environment variables for Firebase, Cloudflare, and Google Workspace.</td>
      <td><code>Environment Spec</code><br/>Dotenv Template</td>
      <td><a href=".env.example"><strong>.env.example</strong></a></td>
    </tr>
    <tr>
      <td><strong>🛡️ Security Headers Configuration</strong></td>
      <td>Enterprise HTTP header configuration enforcing strict Content Security Policy (CSP), HSTS, and frame protections.</td>
      <td><code>Next Config</code><br/>Security Spec</td>
      <td><a href="next.config.ts"><strong>next.config.ts</strong></a></td>
    </tr>
  </tbody>
</table>

---

## 13. Getting Started

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

## 14. License & Open-Source Adoption

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
