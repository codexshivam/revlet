# Revlet IT Manager

**Revlet IT Manager** is a high-density B2B SaaS platform for institutional IT administrators. It provides a unified control panel to manage DNS records, website deployments, team access, and billing across one or more organizations — all backed by Firebase.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Data Models](#data-models)
- [Firestore Security Rules](#firestore-security-rules)
- [Project Structure](#project-structure)
- [Environment Setup](#environment-setup)
- [Running Locally](#running-locally)
- [Deployment](#deployment)

---

## Overview

Revlet IT Manager is built for IT administrators managing multiple institutions on a single platform. Every authenticated user can register and manage one or more organizations, each mapped to a single domain.

### Key Design Principles
- **Multi-tenant:** Each user can own multiple organizations.
- **Domain-locked:** Every organization maps to exactly one domain (immutable after registration).
- **Audit-safe:** Payment vouchers and support tickets are write-once / immutable for users.
- **Cost-Optimized:** All data listings use `getDocs` single fetches instead of live streams to significantly reduce Firebase read operations and billing costs.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Auth & Database | Firebase Auth + Cloud Firestore (`itmanager` database) |
| UI Components | ShadCN UI |
| Styling | Tailwind CSS |
| DNS Management | Cloudflare API (via Server Actions) |
| AI Engine | Genkit (pre-configured, `src/ai/`) |
| Deployment | Vercel |

**Typography:**
- Headlines: *Space Grotesk*
- Body: *Inter*

---

## Features

### Account
| Screen | Description |
|---|---|
| **Account Home** | Register and manage organizations. Live table with status indicators and an inline edit/delete flow. |
| **Manage Payments** | Submit payment vouchers (NPR) with bank details. Immutable historical transaction log. |

### Services *(Context-aware, per selected Organization)*
| Screen | Description |
|---|---|
| **DNS Management** | Full CRUD for A, CNAME, MX, TXT records via the Cloudflare API. Supports import from BIND zone files. |
| **Website Management** | 4-state machine: `not_found` → `external` → `waiting_for_changes` → `ready_and_published`. Manages change quotas and request history. |

### Management
| Screen | Description |
|---|---|
| **Team Management** | Invite team members by name and email. Toggle Active/Inactive status. Per-org RBAC display. |
| **Settings** | Change administrative email (with verification) and password with re-authentication. |

### Support
Authenticated ticket submission form with category selection and a live list of submitted tickets.

---

## Data Models

All data lives in the `itmanager` Firestore database.

### `organizations/{orgId}`
```typescript
{
  name:          string      // Legal organization name (≥ 3 chars)
  domain:        string      // Managed domain, lowercase (immutable after creation)
  address:       string      // Physical office address (optional)
  phone:         string      // Organization contact phone (optional)
  currentEmail:  string      // General inquiry email (optional)
  contactName:   string      // Authorized representative name (required)
  contactPhone:  string      // Representative phone (optional)
  contactEmail:  string      // Representative direct email (required)
  description:   string      // Brief description (optional)
  code:          string      // Auto-generated ID, e.g. "REV-AB1C2" (read-only)
  ownerId:       string      // Firebase Auth UID of admin (set on create)
  status:        string      // "Active" | "Pending Deletion"
  cloudflareZoneId?: string  // Cloudflare zone ID for DNS management
  dnsRequested?: boolean     // Whether a DNS setup has been requested
  hasWebsite?:   boolean     // Whether a website is being managed
  createdAt:     Timestamp
  updatedAt?:    Timestamp
}
```

### `paymentVouchers/{voucherId}`
```typescript
{
  organizationId:   string
  organizationName: string
  amount:           number      // Amount in NPR (must be > 0)
  ownerId:          string      // Admin's Firebase Auth UID
  submittedAt:      Timestamp
  voucherFileName:  string      // Uploaded voucher file reference
  status:           "Not verified" | "Verified" | "Rejected"
}
```
> **Immutable.** Users cannot update or delete submitted vouchers.

### `teamMembers/{memberId}`
```typescript
{
  name:             string
  email:            string
  organizationId:   string
  organizationName: string
  ownerId:          string   // Admin who created the invitation
  status:           "Active" | "Inactive"
  invitedAt:        Timestamp
}
```

### `dnsRecords/{recordId}`
```typescript
{
  organizationId: string
  domain:         string
  type:           "A" | "CNAME" | "MX" | "TXT"
  name:           string
  content:        string
  ttl:            number
  proxied:        boolean
  ownerId:        string
  createdAt:      Timestamp
  updatedAt:      Timestamp
}
```

### `siteModifications/{modId}`
```typescript
{
  organizationId: string
  ownerId:        string
  status:         "pending" | "approved" | "rejected"
  requestType:    string
  details:        string
  createdAt:      Timestamp
}
```
> **Immutable for users.** Status is managed by the backend team.

### `supportTickets/{ticketId}`
```typescript
{
  subject:     string   // Non-empty required
  category:    string
  description: string   // Non-empty required
  ownerId:     string
  ownerEmail:  string
  ownerName:   string
  submittedAt: Timestamp
  status:      "Open" | "In Progress" | "Resolved" | "Closed"
}
```
> **Immutable for users.** Status is managed by the support team.

### `users/{userId}`
```typescript
{
  uid:              string
  email:            string
  displayName:      string
  numOrganizations: number
  organizations:    Array<{ id: string, name: string, domain: string, role: "owner" | "member" }>
  updatedAt:        Timestamp
}
```

---

## Firestore Security Rules

Rules are defined in `firestore.rules` and target the `itmanager` database. Key principles:

- **Only authenticated users** (`request.auth != null`) can read or write data.
- **Resource ownership** is enforced via `ownerId` field checks on every collection.
- **Immutability** is enforced on `paymentVouchers`, `siteModifications`, and `supportTickets` — users cannot update or delete these after submission.
- **Domain uniqueness** is enforced at the application layer (pre-write `getDocs` check) before creating new organizations.

---

## Project Structure

```
project/
├── src/
│   ├── app/
│   │   ├── (auth)/           # Login, register, forgot-password pages
│   │   ├── account/
│   │   │   ├── home/         # Organization management dashboard
│   │   │   ├── billing/      # Payment voucher submission & history
│   │   │   ├── profile/      # User profile management
│   │   │   └── tokens/       # API token management (stub)
│   │   ├── services/
│   │   │   ├── dns/          # Cloudflare DNS management
│   │   │   └── website/      # Website state machine
│   │   ├── management/
│   │   │   ├── team/         # Team member RBAC
│   │   │   └── settings/     # Email & password security controls
│   │   └── support/          # Support ticket submission
│   ├── ai/                   # Genkit AI flows
│   ├── components/
│   │   ├── layout/           # DashboardShell, Sidebar, TopHeader
│   │   ├── org/              # OrgSelector (context switcher)
│   │   └── ui/               # ShadCN UI primitives
│   ├── firebase/             # Firebase init, auth hooks, error emitter
│   ├── hooks/
│   │   ├── use-active-org.ts # Active organization context hook
│   │   └── use-toast.ts
│   └── lib/
│       └── utils.ts          # cn() helper
├── docs/
│   └── blueprint.md          # Original project design blueprint
├── firestore.rules           # Firestore security rules
├── firebase.json             # Firebase project configuration
└── .env.local                # Environment variables (not committed)
```

---

## Environment Setup

Create a `.env.local` file at the project root with the following variables based on `.env.example`:

```env
# Firebase Configuration (Public)
NEXT_PUBLIC_FIREBASE_API_KEY=""
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
NEXT_PUBLIC_FIREBASE_APP_ID=""
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=""

# Cloudflare Tokens (Server-side only)
CLOUDFLARE_DNS_TOKEN=""
CLOUDFLARE_INFRA_TOKEN=""
```

> **Never commit `.env.local` to version control.**  
> The Firebase config values are available in your [Firebase Console](https://console.firebase.google.com) → Project Settings → Web Apps.

---

## Running Locally

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel & GitHub)

This project is optimized for deployment on **Vercel** via **GitHub**.

### 1. Push to GitHub
Initialize a git repository and push the code:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/your-username/revlet-it-manager.git
git push -u origin main
```

### 2. Deploy to Vercel
1. Log in to [Vercel](https://vercel.com) and click **Add New** → **Project**.
2. Import the GitHub repository you just created.
3. Open the **Environment Variables** section and copy all the variables from your `.env.local` file.
4. Click **Deploy**. Vercel will automatically detect the Next.js framework and build the project.

### 3. Add Custom Domain (`app.revlet.me`)
1. Once deployed, go to the project dashboard in Vercel.
2. Navigate to **Settings** → **Domains**.
3. Enter `app.revlet.me` and click Add.
4. Vercel will provide DNS configuration details (usually a CNAME record pointing to `cname.vercel-dns.com.`).
5. Add this CNAME record to your Cloudflare account for `revlet.me`.
6. Once DNS propagates, Vercel will automatically provision the SSL certificate and the app will be live at `https://app.revlet.me`.

---

## Architecture Notes

### Auth Flow
- Auth state is managed by `src/firebase/provider.tsx` (server-side) and `src/firebase/client-provider.tsx` (client-side).
- The `useUser()` hook exposes the current Firebase `User` object anywhere in the app.
- Protected routes redirect to `/login` if `user` is null after auth resolution.

### Organization Context
- `useActiveOrg()` hook maintains the "selected organization" in `localStorage` and fetches the user's authorized organizations on load.
- The `OrgSelector` component in the header allows admins to switch context across services without page reloads.

### Error Handling
- Firestore permission errors are caught globally via `errorEmitter` (`src/firebase/error-emitter.ts`).
- The `FirebaseErrorListener` component (`src/components/FirebaseErrorListener.tsx`) surfaces these errors as toast notifications.

### Data Sync
- `syncUserOrganizations()` (`src/firebase/user-sync.ts`) keeps the `users/{uid}.organizations` array up to date after each organization query.
