# 🏢 Revlet

> **Enterprise Multi-Tenant IT Management & Cloud Infrastructure Platform**  
> Streamlined administration for Cloudflare DNS, Email Routing, Google Workspace for Education, and Institutional Identity.

---

## 🌟 Overview

**Revlet** is a unified multi-tenant IT management dashboard designed for educational institutions and growing organizations. It bridges Cloudflare APIs and Google Workspace Admin SDK into a single control plane, enabling administrators to manage domains, secure DNS, route custom emails, provision workspace accounts, and audit security compliance without context-switching between third-party provider dashboards.

---

## 🚀 Key Features

### 🌐 Cloudflare DNS & Edge Infrastructure
* **Direct Cloudflare API v4 Integration**: Manage DNS records (`A`, `AAAA`, `CNAME`, `TXT`, `MX`, `SRV`) in real-time with instant Cloudflare edge deployment.
* **Proxy & Cache Control**: Toggle Cloudflare CDN proxying and purge cache on demand directly from the Revlet interface.
* **Edge Security Tuning**: Configure SSL/TLS encryption modes (*Off, Flexible, Full, Strict*) and adjust DDoS Security Levels (*Essentially Off, Low, Medium, High, Under Attack*).

### ✉️ Custom Email Routing & Domain Security
* **Cloudflare Email Routing**: Create custom aliases (e.g., `contact@example.com`) forwarding to verified destination inboxes.
* **Domain Security Audits**: Real-time validation and compliance checking for **SPF**, **DKIM**, and **DMARC** email authentication records.

### 🎓 Google Workspace for Education Management
* **Domain-Wide Delegation**: Secure service account authentication to manage Google Workspace tenants seamlessly.
* **User Directory Lifecycle**: Create, suspend, reactivate, and permanently delete workspace accounts.
* **Organizational Units (OUs)**: Structure students, teachers, and administrative staff into structured OU hierarchies.
* **Bulk User Ingestion**: Batch process CSV uploads with validation to register or update hundreds of accounts efficiently.
* **Drive Storage & Security Monitoring**: Aggregate domain Drive storage metrics, alert logs from Google Alert Center, and admin activity audits.

### 👥 Multi-Tenancy & Access Control
* **Context-Driven Multi-Tenancy**: Switch between educational or corporate organizations instantly with unified state persistence.
* **Role-Based Permissions**: Strict role definitions across Platform Superadmin, Organization Owners, and Team Members.
* **Permanent Decommissioning**: Safe organization deletion workflow with double-confirmation safeguards and automated cleanup.

### 💳 Billing & Support
* **Subscription Management**: Transparent plans, invoice histories, and payment voucher uploads backed by verified storage rules.
* **Help & Support Center**: Integrated ticket submission and priority categorization.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 15 (App Router)](https://nextjs.org/) + React 19 |
| **Styling & UI** | [Tailwind CSS](https://tailwindcss.com/), Radix UI Primitives, Lucide Icons |
| **Authentication & Database** | [Firebase Authentication](https://firebase.google.com/docs/auth), [Cloud Firestore](https://firebase.google.com/docs/firestore), Firebase Storage |
| **Edge & DNS** | [Cloudflare API v4](https://developers.cloudflare.com/api/) |
| **Directory SDK** | [Google Workspace Admin SDK](https://developers.google.com/admin-sdk) via `googleapis` |
| **AI Framework** | [Google Genkit](https://firebase.google.com/docs/genkit) + Gemini API |
| **Language** | TypeScript (Strict Mode) |

---

## 📁 Repository Structure

```text
revlet/
├── src/
│   ├── ai/                      # Genkit flows and AI logic
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/              # Login, Signup, Auth Frame
│   │   ├── account/             # Home, Billing, Profile, Tokens
│   │   ├── actions/             # Authenticated Server Actions (Cloudflare, Workspace, Org)
│   │   ├── management/          # Academics, Team Management, Settings
│   │   ├── services/
│   │   │   ├── dns/             # DNS Records table and editor
│   │   │   ├── email/           # Email Routing rules and SPF/DKIM auditor
│   │   │   ├── infrastructure/  # Speed/Cache, SSL, and DDoS controls
│   │   │   └── workspace/       # Users, Storage, Deactivated, Alumni
│   │   └── support/             # Ticketing and support center
│   ├── components/              # Radix UI, layout shells, branding, and navigation
│   ├── firebase/                # Client and Admin SDK initializations
│   └── hooks/                   # useActiveOrg, useAuth, and UI hooks
├── firestore.rules              # Granular Firestore security rules
├── storage.rules                # Granular Firebase Storage security rules
├── next.config.ts               # Security headers (CSP, HSTS, X-Frame-Options)
└── package.json                 # Project dependencies & scripts
```

---

## 🔒 Security Architecture

1. **Server Actions Tenancy Enforcement**:
   Every Server Action executing operations on Cloudflare or Google Workspace invokes `verifyUserOrgAccess` using Firebase Admin SDK tokens. Users cannot manipulate another tenant's resources (IDOR protection).
2. **Strict Firestore & Storage Rules**:
   Client mutations to critical fields (`ownerId`, `cloudflareZoneId`, system status) are rejected; database updates require verified resource ownership or custom admin claims. Storage restricts uploads to verified owners with strict MIME-type and size validation.
3. **Enterprise HTTP Headers**:
   Enforces a strict Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), `X-Content-Type-Options: nosniff`, and `SAMEORIGIN` frame protection.

---

## ⚙️ Getting Started

### Prerequisites

* **Node.js**: `v20.x` or later
* **npm**: `v10.x` or later
* **Firebase Project**: With Authentication, Firestore, and Storage enabled
* **Cloudflare Account**: API token with `Zone.DNS`, `Zone.Email Routing Rules`, and `Account.Email Routing` permissions
* **Google Cloud Project**: Service account with Domain-Wide Delegation enabled for Google Workspace Admin SDK scopes

### 1. Clone & Install

```bash
git clone https://github.com/codexshivam/revlet.git
cd revlet
npm install
```

### 2. Environment Variables

Copy the example environment template:

```bash
cp .env.example .env.local
```

Fill in your configuration keys in `.env.local`:

```env
# Firebase Client SDK
FIREBASE_API_KEY="your-api-key"
FIREBASE_AUTH_DOMAIN="your-app.firebaseapp.com"
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_STORAGE_BUCKET="your-app.appspot.com"
FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
FIREBASE_APP_ID="your-app-id"

# Cloudflare Credentials (Server-side)
CLOUDFLARE_DNS_TOKEN="your-cloudflare-api-token"
CLOUDFLARE_ACCOUNT_ID="your-cloudflare-account-id"

# Google Workspace Admin SDK (Base64 Service Account JSON Key)
GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY="your-base64-encoded-service-account-json"

# Firebase Admin SDK (Base64 Service Account JSON Key)
FIREBASE_SERVICE_ACCOUNT_KEY="your-base64-encoded-firebase-admin-json"
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:9002](http://localhost:9002) in your browser.

### 4. Build for Production

```bash
npm run build
npm start
```

---

## 🧪 Verification & Quality Checks

Run type checks and security linting before committing:

```bash
# Type check TypeScript codebase
npm run typecheck

# Lint Next.js code
npm run lint

# Production build test
npm run build
```
