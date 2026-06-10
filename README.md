# 🏢 Revlet

> A unified IT management dashboard for institutions. Manage organizations, DNS, email routing, Google Workspace users, team access, billing, and support — all from one place.

![Next.js](https://img.shields.io/badge/Next.js_15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Cloudflare](https://img.shields.io/badge/Cloudflare_API-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Google Workspace](https://img.shields.io/badge/Google_Workspace_Admin_SDK-4285F4?style=flat-square&logo=google&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

---

## 📌 What is this?

Revlet is basically a control panel I'm building for managing IT infrastructure across multiple institutions (schools, colleges, orgs). Instead of logging into 5 different admin consoles, everything sits behind one dashboard.

An admin signs up, registers their organization (tied to a domain), and gets access to DNS management, email routing, Google Workspace user management, team invites, payment tracking, and a support ticket system.

The whole thing is multi-tenant — one account can manage multiple organizations, and you can switch between them from the header.

---

## 🧱 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                          │
│                                                                  │
│   Next.js 15 App Router ─── React 19 ─── ShadCN/Radix UI       │
│   Tailwind CSS ─── Lucide Icons ─── Recharts                    │
└────────────────────────┬─────────────────────────────────────────┘
                         │
            ┌────────────┼────────────────┐
            ▼            ▼                ▼
   ┌──────────────┐ ┌──────────┐  ┌─────────────────┐
   │  Firebase     │ │  Server  │  │  Server Actions  │
   │  Client SDK   │ │  Actions │  │  (Workspace)     │
   │              │ │ (DNS)    │  │                   │
   │ • Auth       │ │          │  │ • Google Admin    │
   │ • Firestore  │ │ • CRUD   │  │   Directory SDK   │
   │   (itmanager)│ │ • Import │  │ • Reports API     │
   │              │ │          │  │ • Alert Center     │
   └──────┬───────┘ └────┬─────┘  └────────┬──────────┘
          │              │                  │
          ▼              ▼                  ▼
   ┌──────────────┐ ┌──────────┐  ┌─────────────────┐
   │  Cloud        │ │Cloudflare│  │  Google Workspace │
   │  Firestore    │ │  API     │  │  Admin SDK        │
   │  (Database)   │ │  (DNS)   │  │  (Directory, etc) │
   └──────────────┘ └──────────┘  └─────────────────┘
```

**How data flows:**

- **Auth** → Firebase Authentication handles login/signup/password reset. The `useUser()` hook exposes the auth state app-wide.
- **Firestore** → All app data (orgs, members, tickets, vouchers) lives in a Firestore database called `itmanager`. Client SDK reads/writes directly with security rules enforcing ownership.
- **DNS** → Server Actions in `src/app/actions/cloudflare-dns.ts` proxy requests to the Cloudflare API. The Cloudflare token never hits the browser.
- **Email** → Server Actions in `src/app/actions/cloudflare-email.ts` manage email routing rules through Cloudflare.
- **Google Workspace** → Server Actions in `src/app/actions/google-workspace.ts` talk to Google's Admin SDK for user/OU/storage management. Uses service account delegation.
- **Org Context** → `useActiveOrg()` hook keeps track of which organization is selected. All service pages scope their data to this org.

---

## ✨ Features

### 🏠 Account
| | Feature | What it does |
|---|---|---|
| 🏗️ | **Organization Management** | Register orgs with domain, address, contact info. Auto-generated codes (e.g. `REV-AB1C2`). Edit/delete with confirmation flows. |
| 💳 | **Payment Vouchers** | Submit payment records in NPR with bank details. Immutable after submission for audit trail. |
| 👤 | **Profile** | View and manage account details. |

### 🔧 Services *(scoped to selected org)*
| | Feature | What it does |
|---|---|---|
| 🌐 | **DNS Management** | Full CRUD for A, CNAME, MX, TXT records through Cloudflare. Supports BIND zone file import. |
| 📧 | **Email Routing** | Manage email forwarding rules and routing configurations via Cloudflare Email Routing. |
| 🌍 | **Website Management** | 4-state lifecycle: `not_found` → `external` → `waiting_for_changes` → `ready_and_published`. Change quotas and request history. |
| 🎓 | **Google Workspace** | Full user directory management — create/edit/suspend/delete users. OU-based navigation (Students, Teachers, Staff). Storage monitoring. Alert center. Alumni and deactivated user management. |

### 👥 Management
| | Feature | What it does |
|---|---|---|
| 🤝 | **Team Members** | Invite members by email. Toggle active/inactive. Real-time sync with Firestore listeners. |
| ⚙️ | **Settings** | Change email (with verification) and password (with re-auth). |

### 🎫 Support
Ticket submission with category routing. Tickets are write-once — users can't edit after submission to keep things clean for the support team.

---

## 🗂️ Project Structure

```
src/
├── app/
│   ├── layout.tsx                 # Root layout, metadata, fonts
│   ├── login/                     # Login + forgot password (dialog)
│   ├── signup/                    # Account registration
│   ├── account/
│   │   ├── home/                  # Org dashboard (main landing)
│   │   ├── billing/               # Payment vouchers
│   │   └── profile/               # User profile
│   ├── services/
│   │   ├── dns/                   # Cloudflare DNS management
│   │   ├── email/                 # Email routing
│   │   ├── website/               # Website state machine
│   │   └── workspace/             # Google Workspace hub
│   │       ├── users/             # User directory (CRUD)
│   │       ├── storage/           # Storage monitoring
│   │       ├── alumni/            # Alumni user tracking
│   │       └── deactivated/       # Suspended user management
│   ├── management/
│   │   ├── team/                  # Team member management
│   │   └── settings/              # Security settings
│   ├── support/                   # Support tickets
│   └── actions/                   # Server Actions
│       ├── cloudflare-dns.ts      # DNS API proxy
│       ├── cloudflare-email.ts    # Email routing API proxy
│       └── google-workspace.ts    # Google Admin SDK proxy
├── components/
│   ├── layout/                    # DashboardShell, Sidebar, Header
│   ├── org/                       # OrgSelector (context switcher)
│   └── ui/                        # ShadCN primitives (Button, Card, Dialog, etc.)
├── firebase/
│   ├── config.ts                  # Firebase app init
│   ├── provider.tsx               # Auth state provider
│   ├── client-provider.tsx        # Client-side wrapper
│   ├── user-sync.ts               # Syncs user profile after org changes
│   └── error-emitter.ts           # Global Firestore error handler
└── hooks/
    ├── use-active-org.ts          # Active org context (localStorage + Firestore)
    ├── use-toast.ts               # Toast notification hook
    └── use-mobile.tsx             # Responsive breakpoint hook
```

---

## 🛡️ Security Model

Firestore rules (`firestore.rules`) enforce:

- **Authentication required** — every read/write needs `request.auth != null`
- **Ownership checks** — `ownerId` must match `request.auth.uid` on all collections
- **Immutable records** — payment vouchers, support tickets, and site modification requests can't be updated or deleted by users after creation
- **Domain uniqueness** — checked at the application layer before org creation

Server-side secrets (Cloudflare tokens, Google service account credentials) never leave the server. All external API calls go through Next.js Server Actions.

---

## 🛠️ Tech Stack

| Layer | Tech | Why |
|---|---|---|
| **Framework** | Next.js 15 (App Router + Turbopack) | File-based routing, server actions, fast dev builds |
| **Language** | TypeScript | Type safety across the whole codebase |
| **Auth** | Firebase Authentication | Email/password auth with built-in password reset and email verification |
| **Database** | Cloud Firestore | Real-time capable NoSQL, good security rules, scales without managing infra |
| **DNS** | Cloudflare API | Programmatic DNS record management |
| **Email** | Cloudflare Email Routing | Email forwarding and routing rules |
| **Workspace** | Google Admin SDK | User directory, OUs, storage, alerts for Google Workspace for Education |
| **UI** | ShadCN + Radix UI | Accessible component primitives that are easy to customize |
| **Styling** | Tailwind CSS | Utility-first, fast to iterate |
| **Icons** | Lucide React | Clean, consistent icon set |
| **Charts** | Recharts | For storage and analytics visualizations |
| **Fonts** | Space Grotesk (headlines) + Inter (body) | Clean, modern look |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project with Auth and Firestore enabled
- Cloudflare account with API tokens (for DNS features)
- Google Workspace admin access (for Workspace features)

### Setup

```bash
# clone and install
git clone <repo-url>
cd project
npm install

# copy env template and fill in your values
cp .env.example .env.local

# start dev server
npm run dev
```

The app runs at `http://localhost:9002` by default.

### Environment Variables

Check `.env.example` for the full list. You'll need:

| Variable | What |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web app config (from Firebase Console → Project Settings) |
| `CLOUDFLARE_DNS_TOKEN` | Cloudflare API token with DNS edit permissions |
| `CLOUDFLARE_INFRA_TOKEN` | Cloudflare API token for infrastructure operations |
| `GOOGLE_*` | Google service account credentials for Admin SDK |

> ⚠️ Never commit `.env.local` to git. It's already in `.gitignore`.

---

## 📦 Available Scripts

```bash
npm run dev          # Start dev server (Turbopack, port 9002)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run typecheck    # Run tsc --noEmit
```

---

## 📝 Notes

- The Firestore database is named `itmanager` (not the default `(default)`)
- All data listings use single-fetch queries (`getDocs`) instead of live listeners to keep Firebase read costs low. Real-time listeners are only used where instant UI feedback matters (team members, org list).
- Google Workspace features require a service account with domain-wide delegation set up in the Google Admin Console.
- The forgot password flow is handled as a dialog inside the login page, not a separate route.
