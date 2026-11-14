<div align="center">

<img src="public/banner.svg" width="100%" alt="Revlet Enterprise IT Management Control Plane" />

</div>

---

## Run Your Organization's DNS, Email & Team Access from One Place

**Revlet** (`app.revlet.me`) is a unified, multi-tenant **Cloud IT & Communications Control Plane** built for growing businesses, educational institutions, and distributed teams. Instead of juggling separate registrar dashboards, DNS panels, mail server tools, and spreadsheet-based permission lists, Revlet brings **Custom Domain Email**, **Authoritative DNS Management**, and **Granular Team Delegation** together in one fast, intuitive workspace.

Modern organizations lose hours every week switching between disconnected infrastructure portals. A single misconfigured `MX` or `TXT` record can silently disrupt company email, while sharing root credentials across IT staff introduces unnecessary security risk. Revlet solves both problems by giving administrators one clean control center:

1. **Professional Email on Your Own Domain**: Launch `@yourdomain.com` mailboxes in minutes with automated SPF, DKIM, and DMARC configuration, bulk CSV onboarding, organizational units, groups, and built-in 14-day recovery protection.
2. **Effortless DNS Control**: Manage every domain record with instant search, filtering, pagination, proxy control, and point-in-time zone snapshots so changes are always reversible.
3. **Confident Team Delegation**: Invite colleagues as organization admins or scope their access strictly to DNS or Email per organization—without ever sharing upstream API keys or root passwords.

---

## Core Platform Capabilities

| Capability | Designed for Teams | Powered Under the Hood |
| :--- | :--- | :--- |
| **Business Email Service** | Custom `@domain` mailboxes, aliases, mailing groups, catch-all routing, and Organizational Units | Hybrid **Stalwart Mail** (IMAP/JMAP directory) + **Amazon SES v2** outbound relay with 2048-bit RSA DKIM signing |
| **Deliverability & Protection** | Automated DNS health checks with one-click record repair and proactive reputation protection | Live SPF/DKIM/DMARC verification, cryptographically signed **AWS SNS** bounce/complaint webhooks, and auto-pause thresholds |
| **Data Retention & Recovery** | Safe 14-day recovery window for deleted accounts and deactivated domains, with automated owner alerts | Scheduled purge pipeline (`purgeExpiredMailData`) with branded notifications sent from `alerts@revlet.me` |
| **Authoritative DNS Management** | Clean record management (`A`, `AAAA`, `CNAME`, `MX`, `TXT`, `SRV`, `NS`) with search, pagination, and proxy toggles | Authenticated server actions (`dns-service.ts`) with multi-page sync, conflict cleanup, and zone snapshot rollbacks |
| **Bulk User Operations** | Onboard or audit hundreds of mailboxes in seconds with downloadable CSV templates and password support | Validated CSV batch ingestion (`bulkCreateMailUsers`) and one-click CSV directory export |
| **Granular Team Management** | Assign `Org: Admin` or service-specific roles (`DNS: Read/Edit/Admin`, `Email: Read/Add/Admin`) per organization | Zero-trust server-side enforcement via `verifyUserOrgAccess` and scoped Firestore team memberships |
| **Multi-Organization Workspace** | Switch seamlessly across multiple domains and client organizations from a single account | Persistent `OrgProvider` / `useActiveOrg` state engine with real-time tenant synchronization |

---

## How Revlet Works

Revlet coordinates identity verification, DNS automation, and mail provisioning through a resilient server-side pipeline:

```text
[ AUTHENTICATED USER ACTION ]
       │
       ├──► STAGE 1: ZERO-TRUST TENANCY & PERMISSION CHECK (auth-helper.ts)
       │      ├── Verify Firebase Auth ID token cryptographically
       │      ├── Confirm organization ownership or active, non-suspended team membership
       │      └── Enforce per-organization service scopes (Org: Admin, DNS:*, Email:*)
       │
       ├──► STAGE 2: DNS & DOMAIN ORCHESTRATION (dns-service.ts)
       │      ├── Connect organization-isolated DNS zones (platform-managed or BYOT encrypted keys)
       │      ├── Manage A, AAAA, CNAME, MX, TXT, and SRV records with snapshot protection
       │      └── Automatically clean conflicting MX records and sync Email Service DNS records
       │
       ├──► STAGE 3: EMAIL & DIRECTORY PROVISIONING (email-service.ts)
       │      ├── Provision domain identity & 2048-bit RSA DKIM keys in Amazon SES v2
       │      ├── Synchronize mailboxes, aliases, groups, and passwords with Stalwart Mail via JMAP
       │      └── Monitor bounce/complaint rates via signed AWS SNS webhooks (/api/mail/v1/sns-bounce)
       │
       └──► STAGE 4: AUDIT TRAIL & OWNER ALERTS
              ├── Record administrative mutations with actor metadata in Firestore
              └── Deliver branded lifecycle notifications from alerts@revlet.me
```

---

## Security & Zero-Trust Architecture

Revlet is engineered with **Defense-in-Depth** so every organization's domains, mailboxes, and credentials remain strictly isolated:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          REVLET ZERO-TRUST SECURITY ENVELOPE                           │
├────────────────────────┬─────────────────────────────┬─────────────────────────────────┤
│ LAYER                  │ MECHANISM                   │ PROTECTION                      │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 1. Edge & Transport    │ HSTS + CSP + Framing Guards │ Strict-Transport-Security (2yr) │
│                        │ (next.config.ts)            │ Clickjacking & MIME protection  │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 2. Server Tenancy      │ verifyUserOrgAccess         │ Cryptographic token checks,     │
│                        │ (Server Actions)            │ anti-IDOR & granular RBAC       │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 3. Webhook Security    │ AWS SNS Signature Verifier  │ RSA-SHA1 / RSA-SHA256 check on  │
│                        │ (sns-bounce/route.ts)       │ verified amazonaws.com certs    │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 4. Database Integrity  │ Granular Firestore Rules    │ Blocks client-side elevation of │
│                        │ (firestore.rules)           │ ownerId, zoneId, or service state│
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ 5. Secret Quarantine   │ Server-Only Credentials     │ AES-GCM encrypted BYOT tokens & │
│                        │                             │ server-side SES/Stalwart keys   │
└────────────────────────┴─────────────────────────────┴─────────────────────────────────┘
```

---

## Product Modules

### 1. Business Email Service (`/services/email`)
* **Everything Teams Expect from Modern Email**: Create `@yourdomain.com` accounts, manage display names and aliases, organize teams with Organizational Units, and configure mailing groups or catch-all routing.
* **Built-In Deliverability Guardrails**: Missing DNS records are surfaced automatically with one-click repair for managed DNS zones, while Amazon SES DKIM and signed SNS bounce monitoring protect your domain reputation.
* **Safe Recovery & Automated Retention**: Deleted accounts and deactivated email services enter a 14-day recovery window before permanent removal, with clear alerts sent to the organization owner.

### 2. Authoritative DNS Management (`/services/dns`)
* **Fast, Clean Record Control**: Search, filter, paginate, and update DNS records across desktop and mobile without navigating complex legacy screens.
* **Snapshots & Confidence**: Capture zone snapshots before major changes and roll back if needed.

### 3. Team Management (`/management/team`)
* **Right-Sized Access Per Organization**: Grant trusted colleagues `Org: Admin` access or assign only the specific DNS or Email permissions they need for each organization they manage.
* **Zero Credential Sharing**: Team members sign in with their own Revlet accounts—never with your registrar, Cloudflare, AWS, or mail server root credentials.

### 4. Account Home & Organization Management (`/account/home`)
* **Multi-Organization Hub**: Register new organizations, manage domain settings, and switch active workspaces instantaneously.

---

## Getting Started (Self-Hosting & Local Development)

### Prerequisites
* **Node.js**: `v20.x` or later (LTS recommended)
* **npm**: `v10.x` or later
* **Firebase Project**: Authentication, Firestore, and Storage enabled
* **DNS Provider Token**: Cloudflare API token (if using platform-managed DNS)
* **Mail Stack (for Email Service)**: Amazon SES v2 credentials and a Stalwart Mail server endpoint

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
Review [`.env.example`](.env.example) and populate `.env.local` with your own credentials for Firebase, Cloudflare, Stalwart Mail, Amazon SES, `REVLET_ALERTS_FROM`, `REVLET_MAIL_INTERNAL_SECRET`, and `CRON_SECRET`. Never commit `.env.local` or any private keys.

### 3. Launch Development Server
```bash
npm run dev
```
Open [http://localhost:9002](http://localhost:9002) in your browser.

### 4. Verify & Build for Production
```bash
npm run typecheck
npm run lint
npm run build
```

---

## Official Documents & Governance

| Document | Purpose | Location |
| :--- | :--- | :--- |
| **Security Policy** | Vulnerability disclosure SLAs, threat model, and reporting process | [SECURITY.md](SECURITY.md) |
| **Contributing Guidelines** | Development setup, coding standards, and pull request workflow | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Code of Conduct** | Community standards and respectful collaboration guidelines | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| **Environment Template** | Required environment variables for local and production deployments | [.env.example](.env.example) |
| **Firestore Security Rules** | Tenant isolation and role-based database access rules | [firestore.rules](firestore.rules) |
| **Storage Security Rules** | Authenticated object upload and MIME/size policies | [storage.rules](storage.rules) |

---

## License, Trademarks & Legal Notice

Revlet is open-source software licensed under the **Apache License, Version 2.0**. See the [LICENSE](LICENSE) file for the complete legal text.

### Trademarks & Brand Assets
The **Revlet** name, logo, domain (`revlet.me`, `app.revlet.me`), and associated brand assets are trademarks of Revlet. The Apache-2.0 license grants rights to the source code only and does not grant permission to use Revlet trademarks or branding in a manner that suggests endorsement or official affiliation without prior written consent.

### Third-Party Services & Trademarks
References to third-party platforms and technologies (such as Cloudflare, Amazon SES, Firebase, Next.js, and Stalwart Mail) are for compatibility and descriptive purposes only. All third-party trademarks remain the property of their respective owners, and use of those services is governed by their own terms and privacy policies.

### No Warranty & Limitation of Liability
As set forth in Sections 7 and 8 of the [Apache License, Version 2.0](LICENSE), this software is provided on an **"AS IS"** basis without warranties or conditions of any kind, either express or implied, and neither the copyright holders nor contributors shall be liable for any damages arising from its use, to the fullest extent permitted by applicable law.
