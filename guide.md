# Revlet — Website Design Guide for AI Agents

> **Purpose:** This guide instructs an AI agent to build the **public-facing marketing website** for Revlet — a B2B SaaS platform for institutional IT administrators. The website lives at `revlet.me` and must clearly communicate what the platform does, who it's for, and why institutions should adopt it. The application itself lives at `app.revlet.me`.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Design System — Colors](#2-design-system--colors)
3. [Design System — Typography](#3-design-system--typography)
4. [Design System — Spacing & Layout](#4-design-system--spacing--layout)
5. [Design System — Components](#5-design-system--components)
6. [Design System — Animations & Interactions](#6-design-system--animations--interactions)
7. [Tech Stack](#7-tech-stack)
8. [Page Specifications](#8-page-specifications)
9. [Content Strategy & Messaging](#9-content-strategy--messaging)
10. [Feature Listings](#10-feature-listings)
11. [Responsive Design Rules](#11-responsive-design-rules)
12. [Assets & Media](#12-assets--media)
13. [SEO & Performance](#13-seo--performance)
14. [Do's and Don'ts](#14-dos-and-donts)

---

## 1. Platform Overview

### What is Revlet?

Revlet is a **unified IT management control panel** built for institutions — schools, colleges, universities, and organizations. It gives IT administrators a single dashboard to manage:

- **Organizations** — Register and manage multiple institutions from one account
- **DNS Records** — Full CRUD for A, CNAME, MX, TXT records via Cloudflare API
- **Website Deployments** — Manage website lifecycle (provision → deploy → publish) with change quotas
- **Team Access** — Invite team members, toggle active/inactive status, per-org role-based access
- **Billing & Payments** — Submit payment vouchers (NPR), track transaction history
- **Support** — Authenticated support ticket system with category routing

### Who is it for?

- IT administrators at educational institutions
- System administrators managing multi-tenant infrastructure
- Organizations needing centralized domain, website, and team management

### Key Value Propositions

1. **One Dashboard, All Institutions** — Manage DNS, websites, teams, and billing across multiple organizations from a single login
2. **Cloudflare-Powered DNS** — Enterprise-grade DNS management with zone file import support
3. **Zero DevOps Needed** — Manage website deployments through a simple state machine without touching servers
4. **Audit-Safe Records** — Payment vouchers and support tickets are immutable for compliance
5. **Cost-Optimized Architecture** — Built on Firebase with optimized read patterns (no unnecessary live streams)

---

## 2. Design System — Colors

### Primary Palette

The design language is **clean, professional, and trustworthy** — built around a blue primary with neutral slates.

| Token | HSL | Hex (approx) | Usage |
|---|---|---|---|
| **Primary** | `221 83% 53%` | `#2563EB` | CTAs, links, active states, brand accent |
| **Primary Hover** | `221 83% 47%` | `#1D4ED8` | Hover state for primary elements |
| **Primary Light** | `221 83% 53% / 0.1` | `rgba(37,99,235,0.1)` | Light primary backgrounds, badges |
| **Primary Glow** | — | `rgba(37,99,235,0.15)` | Button box-shadow glow |
| **Secondary** | `217 17% 39%` | `#536382` | Secondary text, muted actions |

### Neutral Palette

| Token | HSL | Hex (approx) | Usage |
|---|---|---|---|
| **Foreground** | `204 9% 10.8%` | `#191C1E` | Headlines, logo text, primary text |
| **Body Text** | — | `#45464D` | Body copy, descriptions, secondary text |
| **Muted Text** | `215 16% 47%` | `#64748B` | Captions, labels, timestamps |
| **Muted Surface** | `210 16% 96%` | `#F1F5F9` | Section backgrounds, muted areas |
| **Background** | `207 22% 97.6%` | `#F4F7F9` | Page background |
| **Content Area** | — | `#F8FAFC` | Main content background |
| **Card Surface** | `0 0% 100%` | `#FFFFFF` | Cards, dialogs, popovers |
| **Border** | `214 32% 91%` | `#E2E8F0` | Borders, dividers |
| **Input Border** | — | `#C6C6CD` | Form input borders |
| **Light Border** | — | `#ECEEF0` | Subtle card borders |

### Semantic Colors

| Token | HSL | Hex (approx) | Usage |
|---|---|---|---|
| **Success** | — | Emerald-500 (`#10B981`) | Success indicators, checkmarks |
| **Destructive** | `0 84.2% 60.2%` | `#EF4444` | Errors, destructive actions, alerts |
| **Warning** | — | Amber-500 (`#F59E0B`) | Warnings, pending states |
| **Info** | — | Blue-500 (`#3B82F6`) | Informational badges |

### Gradient Patterns

Use these sparingly for hero sections and accent areas:

```css
/* Hero gradient — subtle blue wash */
background: linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 50%, #F8FAFC 100%);

/* CTA accent gradient */
background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);

/* Feature card hover glow */
box-shadow: 0px 4px 12px rgba(37, 99, 235, 0.15);

/* Subtle card elevation */
box-shadow: 0px 4px 12px rgba(15, 23, 42, 0.03);

/* Dialog / modal elevation */
box-shadow: 0px 12px 32px rgba(15, 23, 42, 0.08);
```

---

## 3. Design System — Typography

### Font Families

Load via Google Fonts CDN:

```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

| Role | Font | Weights | CSS Variable |
|---|---|---|---|
| **Headlines** | Space Grotesk | 400, 500, 600, 700 | `font-family: 'Space Grotesk', sans-serif` |
| **Body** | Inter | 400, 500, 600, 700 | `font-family: 'Inter', sans-serif` |
| **Code/Mono** | System monospace | — | `font-family: monospace` |

### Type Scale

| Element | Font | Size | Weight | Color | Additional |
|---|---|---|---|---|---|
| **Logo** | Space Grotesk | 20px | 700 (Bold) | `#191C1E` | `letter-spacing: 0.1em; text-transform: uppercase` |
| **Hero H1** | Space Grotesk | 48–64px | 700 | `#191C1E` | `letter-spacing: -0.025em` (tracking-tight) |
| **Section H2** | Space Grotesk | 36px | 700 | `#191C1E` | `letter-spacing: -0.025em` |
| **Card H3** | Space Grotesk | 18–20px | 600 | Slate-900 | — |
| **Section Labels** | Inter | 10px | 700 | Slate-400 | `text-transform: uppercase; letter-spacing: 0.1em` |
| **Body Large** | Inter | 16–18px | 400 | `#45464D` | Line-height: 1.6–1.75 |
| **Body** | Inter | 14px | 400 | `#45464D` | Line-height: 1.5 |
| **Body Small** | Inter | 12px | 400 | `#45464D` | — |
| **Button Text** | Inter | 12–14px | 600–700 | Inherits variant | — |
| **Form Labels** | Inter | 10px | 600 | Slate-500 | `text-transform: uppercase; letter-spacing: 0.1em` |
| **Table Headers** | Inter | 10px | 700 | Slate-400 | `text-transform: uppercase; letter-spacing: 0.1em` |
| **Footer** | Inter | 10px | 600 | Slate-400 | `letter-spacing: 0.2em; text-transform: uppercase` |
| **Mono Codes** | Monospace | 10px | 400 | Slate-400 | `letter-spacing: -0.05em; text-transform: uppercase` |

---

## 4. Design System — Spacing & Layout

### Border Radius

| Size | Value | Usage |
|---|---|---|
| `sm` | 2px | Small chips, tags |
| `default` | 4px | Inputs, small buttons |
| `md` | 6px | Badges, standard elements |
| `lg` | 8px | Cards, containers |
| `xl` | 12px | Large cards, modals, hero sections |
| `full` | 9999px | Avatars, pill badges |

### Spacing Scale

Follow a **4px base grid** system:

- **Component padding:** `16px` (cards), `24px–32px` (sections)
- **Section vertical spacing:** `48–64px` between major sections
- **Page max-width:** `1280px` (max-w-6xl) for content, centered
- **Page padding:** `16px` (mobile), `32px` (tablet+desktop)
- **Card gaps:** `24px` between cards in a grid

### Layout Patterns

```
┌─────────────────────────────────────────────────────────────┐
│  NAVBAR (sticky, h-16, white, border-b, backdrop-blur)      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  HERO SECTION (centered, large heading, subtext, CTA)       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SOCIAL PROOF / TRUST BAR                                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FEATURES GRID (3-col on desktop, 1-col on mobile)          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  HOW IT WORKS (numbered steps, alternating layout)          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DETAILED FEATURE SECTIONS (with screenshots)               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PRICING / PLANS                                            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TESTIMONIALS / USE CASES                                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CTA SECTION (final conversion push)                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  FOOTER (links, copyright, social)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Design System — Components

### Buttons

| Variant | Background | Text | Border | Shadow | Hover |
|---|---|---|---|---|---|
| **Primary** | `#2563EB` | `#FFFFFF` | None | `0 4px 12px rgba(37,99,235,0.15)` | `#1D4ED8`, stronger shadow |
| **Secondary** | `#536382` | `#FFFFFF` | None | None | `opacity: 0.8` |
| **Outline** | Transparent | `#191C1E` | `1px solid #E2E8F0` | None | `bg: #F1F5F9` |
| **Ghost** | Transparent | `#191C1E` | None | None | `bg: #F1F5F9` |
| **Destructive** | `#EF4444` | `#FFFFFF` | None | None | Darken 10% |

All buttons:
- Border radius: `4px` (default) or `6px` (md)
- Font: Inter, 12–14px, weight 600–700
- Height: `40px` (default), `36px` (sm), `44px` (lg)
- Padding: `0 16px` (default), `0 12px` (sm), `0 32px` (lg)
- Transition: `all 150ms ease`

### Cards

```css
.card {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 8px; /* lg */
  box-shadow: 0px 4px 12px rgba(15, 23, 42, 0.03);
  overflow: hidden;
}

/* Optional blue accent bar at top */
.card-accent::before {
  content: '';
  display: block;
  height: 4px;
  width: 100%;
  background: rgba(37, 99, 235, 0.2); /* primary/20 */
}

/* Hover state for interactive cards */
.card:hover {
  box-shadow: 0px 4px 12px rgba(37, 99, 235, 0.15);
  border-color: rgba(37, 99, 235, 0.3);
  transform: translateY(-2px);
  transition: all 200ms ease;
}
```

### Badges

| Variant | Background | Text | Border |
|---|---|---|---|
| **Default** | `#2563EB` | `#FFFFFF` | None |
| **Outline** | Transparent | `#191C1E` | `1px solid #E2E8F0` |
| **Education** | `#EFF6FF` (blue-50) | `#2563EB` | `1px solid #DBEAFE` (blue-100) |
| **Success** | `#ECFDF5` (emerald-50) | `#10B981` | `1px solid #D1FAE5` |
| **Muted** | `#F1F5F9` | `#64748B` | None |

All badges: `font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 9999px;`

### Navigation Bar (Website)

```css
.navbar {
  position: sticky;
  top: 0;
  height: 64px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #E2E8F0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  max-width: 1280px;
  margin: 0 auto;
}
```

- **Logo (left):** "REVLET" — Space Grotesk, 20px, bold, tracking `0.1em`, uppercase, color `#191C1E`
- **Nav Links (center):** Inter, 14px, weight 500, color `#64748B`, hover color `#191C1E`
- **CTA (right):** Primary button — "Get Started" or "Open Dashboard"

### Input Fields

```css
.input {
  height: 40px;
  border: 1px solid #C6C6CD;
  border-radius: 4px;
  padding: 0 12px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  color: #191C1E;
  background: #FFFFFF;
  transition: all 150ms ease;
}

.input:focus {
  border-color: #2563EB;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  outline: none;
}

.input::placeholder {
  color: #64748B;
}
```

### Section Dividers

Use the same pattern as the app sidebar:

```css
.section-label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 700;
  color: #94A3B8; /* slate-400 */
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #E2E8F0;
}
```

---

## 6. Design System — Animations & Interactions

### Page & Section Entrances

```css
/* Fade in + slight upward slide — use for sections on scroll */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fadeInUp 0.6s ease-out forwards;
}

/* Stagger children — add delay per child */
.stagger > *:nth-child(1) { animation-delay: 0ms; }
.stagger > *:nth-child(2) { animation-delay: 100ms; }
.stagger > *:nth-child(3) { animation-delay: 200ms; }
.stagger > *:nth-child(4) { animation-delay: 300ms; }
.stagger > *:nth-child(5) { animation-delay: 400ms; }
.stagger > *:nth-child(6) { animation-delay: 500ms; }
```

### Micro-Interactions

- **Button hover:** Scale to `1.02`, shadow intensifies — `transition: all 150ms ease`
- **Card hover:** Translate Y `-2px`, shadow shifts to blue glow — `transition: all 200ms ease`
- **Link hover:** Color shift from muted to foreground, optional underline slide
- **Icon hover:** Slight rotation or scale `1.1` — `transition: transform 200ms ease`
- **Scroll-triggered entrances:** Use Intersection Observer to trigger `.animate-fade-in-up` when sections enter viewport

### Loading States

```css
/* Skeleton pulse — matches app pattern */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.skeleton {
  background: #F1F5F9;
  border-radius: 4px;
  animation: pulse 2s ease-in-out infinite;
}

/* Spinner — matches app Loader2 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #E2E8F0;
  border-top-color: #2563EB;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
```

---

## 7. Tech Stack

The website **MUST** be built with:

| Layer | Technology | Notes |
|---|---|---|
| **Framework** | React.js | Use Create React App, Vite, or Next.js (static export) |
| **Styling** | CSS Modules or Vanilla CSS | Match the existing design tokens exactly |
| **Icons** | Lucide React (`lucide-react`) | Same icon library as the app |
| **Fonts** | Google Fonts (Space Grotesk + Inter) | Load via CDN link tag |
| **Animations** | CSS animations + Intersection Observer | No heavy animation libraries needed |
| **Deployment** | Vercel or Firebase Hosting | Static site, no SSR required for marketing |

### Package Dependencies

```json
{
  "dependencies": {
    "react": "^19.2.1",
    "react-dom": "^19.2.1",
    "lucide-react": "^0.475.0",
    "react-router-dom": "^7.0.0"
  }
}
```

---

## 8. Page Specifications

### 8.1 Landing Page (`/`)

This is the most critical page. A visitor should understand what Revlet does within **5 seconds** of landing.

#### Hero Section

```
Layout: Centered, full-width, min-height 90vh
Background: Subtle gradient — linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 50%, #F8FAFC 100%)
```

**Content:**
- **Eyebrow badge:** Pill badge — "Built for Institutions" (blue-50 bg, blue-600 text)
- **Headline (H1):** Space Grotesk, 48–64px, bold, `#191C1E`
  - Example: "Manage Your Institution's Entire IT Infrastructure — From One Dashboard"
- **Subheadline:** Inter, 18px, `#45464D`, max-width 640px
  - Example: "DNS records, website deployments, team access, and billing — unified under a single control panel built for IT administrators."
- **CTA buttons:**
  - Primary: "Get Started Free" → links to `app.revlet.me/signup`
  - Secondary (outline): "See How It Works" → scrolls to features
- **Hero visual:** Screenshot or mockup of the Revlet dashboard, framed in a clean browser window with subtle shadow (`0px 12px 32px rgba(15,23,42,0.08)`)

#### Trust / Social Proof Bar

```
Layout: Horizontal bar, centered logos or stats
Background: White or very light slate (#F8FAFC)
Border: Top and bottom 1px #E2E8F0
```

**Content options (pick what's available):**
- Number of institutions managed
- Uptime percentage
- "Powered by Cloudflare" + "Built on Firebase" badges
- "Enterprise-Grade Security" badge

#### Features Grid

```
Layout: 3 columns (desktop), 2 columns (tablet), 1 column (mobile)
Gap: 24px
Max-width: 1280px, centered
```

**Section header:**
- Section label: "FEATURES" (10px, uppercase, bold, slate-400, with line)
- H2: "Everything Your IT Team Needs" — Space Grotesk, 36px, bold
- Subtitle: Inter, 16px, `#45464D`

**6 Feature Cards:**

Each card follows the card component pattern with:
- Blue accent bar at top (4px, `primary/20`)
- Icon from lucide-react (24px, `#2563EB`) in a blue-50 circle
- Title: Space Grotesk, 18px, semibold
- Description: Inter, 14px, `#45464D`, 2–3 lines
- Hover: blue glow shadow + slight lift

| # | Icon | Title | Description |
|---|---|---|---|
| 1 | `LayoutDashboard` | Organization Management | Register and manage multiple institutions. Live status indicators, inline editing, and auto-generated org codes. |
| 2 | `Globe` | DNS Management | Full control over A, CNAME, MX, and TXT records via Cloudflare. Import from BIND zone files in seconds. |
| 3 | `Database` | Website Deployments | Manage your website lifecycle from provision to publish. Track modification requests with built-in change quotas. |
| 4 | `Users` | Team & Access Control | Invite team members by email, toggle active/inactive status, and manage role-based access per organization. |
| 5 | `Briefcase` | Billing & Payments | Submit payment vouchers with bank details. Immutable audit trail of all transactions for compliance. |
| 6 | `ShieldCheck` | Support & Security | Authenticated ticket system with category routing. Password management and email verification built in. |

#### How It Works

```
Layout: Numbered steps, vertical or alternating left-right
Background: White
```

**Section header:**
- Section label: "HOW IT WORKS"
- H2: "Up and Running in Minutes"

**3 Steps:**
1. **Create Your Account** — Sign up and register your first organization with its domain
2. **Configure Services** — Set up DNS records, manage your website, and invite your team
3. **Monitor & Manage** — Track payments, submit support tickets, and maintain full control

Each step: number badge (blue circle with white text), title, description, and an accompanying illustration or screenshot.

#### Detailed Feature Showcase

For 2–3 key features, show larger sections with:
- Left: Text content (headline, bullet points, CTA link)
- Right: App screenshot / mockup
- Alternate layout direction per section

**Feature 1: DNS Management**
- Headline: "Enterprise-Grade DNS, Zero Complexity"
- Bullets:
  - Manage A, CNAME, MX, TXT records from one interface
  - Import existing records from BIND zone files
  - Powered by Cloudflare's global network
  - Proxy toggle and TTL control per record
- Screenshot: DNS management page

**Feature 2: Multi-Org Dashboard**
- Headline: "All Your Institutions, One Login"
- Bullets:
  - Register unlimited organizations
  - Auto-generated unique org codes (e.g., REV-AB1C2)
  - Live status indicators (Active, Pending)
  - Switch between orgs instantly
- Screenshot: Account home page with org table

**Feature 3: Website Management**
- Headline: "Deploy Websites Without DevOps"
- Bullets:
  - Simple 4-state lifecycle management
  - Track modification requests and approvals
  - Built-in change quotas per organization
  - Full audit history of all changes
- Screenshot: Website management page

#### Pricing Section (Optional)

```
Layout: 2–3 pricing cards, centered
Background: #F8FAFC
```

Use pricing cards with:
- Plan name (Space Grotesk, bold)
- Price in NPR
- Feature list with checkmarks (emerald-500)
- CTA button (Primary for recommended plan, Outline for others)
- "Most Popular" badge on recommended plan

#### Final CTA Section

```
Layout: Centered, full-width
Background: #2563EB (primary) or gradient
Text: White
```

- Headline: "Ready to Simplify Your IT Management?"
- Subtext: "Join institutions already using Revlet to manage their infrastructure."
- CTA: White button on blue background — "Get Started Free"
- Secondary: "Contact Sales" link

#### Footer

```
Layout: 4-column grid (desktop), stacked (mobile)
Background: #191C1E (near-black) or White with top border
Text: #94A3B8 (slate-400) for links, #64748B for headings
```

**Columns:**
1. **Logo + Description:** REVLET logo, one-line description, social links
2. **Product:** Features, Pricing, Documentation, Changelog
3. **Company:** About, Blog, Careers, Contact
4. **Legal:** Privacy Policy, Terms of Service, Cookie Policy

**Bottom bar:** `© 2026 REVLET PLATFORM • HELLO@REVLET.ME` — 10px, uppercase, tracking `0.2em`, slate-400

---

### 8.2 Features Page (`/features`)

Expanded version of the features grid. Each feature gets a dedicated section with:
- Detailed description (4–6 sentences)
- Bullet list of capabilities
- Full-width screenshot
- Related features cross-links

### 8.3 Pricing Page (`/pricing`)

- Pricing cards (as described above)
- FAQ accordion below pricing cards
- "Contact us for enterprise" CTA

### 8.4 About Page (`/about`)

- Company mission and story
- Team section (if applicable)
- Contact information: `hello@revlet.me`

### 8.5 Contact Page (`/contact`)

- Contact form (name, email, subject, message)
- Use the input field styling from the design system
- Map or address (optional)
- Direct email: `hello@revlet.me`

---

## 9. Content Strategy & Messaging

### Voice & Tone

- **Professional** but not corporate-stiff
- **Clear** and jargon-free — IT admins are busy, don't make them think
- **Confident** — state benefits directly, no hedging language
- **Action-oriented** — lead with verbs in CTAs and headings

### Key Messages to Communicate

Within the first screen (above the fold), a visitor must understand:

1. **WHAT:** Revlet is an IT management platform for institutions
2. **WHO:** Built for IT administrators at schools, colleges, and organizations
3. **WHY:** It consolidates DNS, websites, teams, and billing into one dashboard
4. **HOW:** Sign up → Register org → Start managing

### Headline Templates

- "Manage Your Institution's IT — All in One Place"
- "DNS, Websites, Teams, Billing — One Dashboard"
- "The Control Panel Built for Institutional IT"
- "Stop Juggling Tools. Start Managing Everything."
- "Enterprise IT Management, Simplified for Institutions"

### Avoid These

- ❌ Vague language like "powerful platform" or "next-gen solution"
- ❌ Technical jargon without context
- ❌ Feature lists without explaining benefits
- ❌ Placeholder content — every word must be real and meaningful

---

## 10. Feature Listings

When listing features on the website, use this **exact information** derived from the platform:

### Complete Feature List

#### Organization Management
- Register and manage multiple institutions from a single account
- Each organization is mapped to a unique domain (immutable after creation)
- Auto-generated organization codes (e.g., REV-AB1C2) for easy identification
- Live status indicators: Active, Pending Deletion
- Inline edit and delete flows with confirmation dialogs
- Educational institution flag for specialized features
- Organization profile with name, domain, address, phone, email, contact person, and description

#### DNS Management (Cloudflare-Powered)
- Full CRUD operations for DNS records
- Supported record types: A, CNAME, MX, TXT
- Import records from BIND zone files
- Per-record controls: TTL, proxy toggle (Cloudflare proxy on/off)
- Real-time sync with Cloudflare's global DNS network
- Per-organization DNS scoping

#### Website Deployment Management
- 4-state lifecycle: Not Found → External → Waiting for Changes → Ready & Published
- Submit modification requests with detailed descriptions
- Built-in change quota system per organization
- Full history of all modification requests with status tracking
- Approval/rejection workflow

#### Team & Access Management
- Invite team members by name and email
- Toggle member status: Active / Inactive
- Per-organization role-based access display
- Team member list with invitation timestamps
- Organization-scoped team views

#### Billing & Payments
- Submit payment vouchers with amount (NPR), bank details, and file attachments
- Payment status tracking: Not Verified → Verified → Rejected
- Immutable transaction log for audit compliance
- Organization-linked payment records
- Full historical transaction view

#### Support System
- Authenticated support ticket submission
- Category-based ticket routing
- Ticket status lifecycle: Open → In Progress → Resolved → Closed
- Write-once tickets (immutable for users) for audit safety
- Ticket list with real-time status display

#### Authentication & Security
- Email/password authentication via Firebase Auth
- Password change with re-authentication requirement
- Email change with verification
- Forgot password flow with email reset
- Session management

---

## 11. Responsive Design Rules

### Breakpoints

| Name | Min Width | Target |
|---|---|---|
| **Mobile** | 0px | Phones (portrait) |
| **Tablet** | 768px | Tablets, small laptops |
| **Desktop** | 1024px | Laptops, desktops |
| **Wide** | 1280px | Large monitors |

### Layout Adaptations

| Element | Mobile | Tablet | Desktop |
|---|---|---|---|
| **Navbar** | Hamburger menu | Full nav | Full nav |
| **Hero heading** | 32px | 40px | 48–64px |
| **Feature grid** | 1 column | 2 columns | 3 columns |
| **Feature showcase** | Stacked (text → image) | Stacked | Side-by-side |
| **Pricing cards** | 1 column, stacked | 2–3 columns | 3 columns |
| **Footer** | 1 column, stacked | 2 columns | 4 columns |
| **Section padding** | `16px` horizontal | `24px` | `32px` |
| **Section spacing** | `48px` vertical | `56px` | `64px` |

### Mobile-First Rules

1. **Touch targets:** All interactive elements must be at least 44×44px
2. **Font sizes:** Never go below 14px for body text on mobile
3. **Images:** Use responsive images, lazy-load below the fold
4. **Hamburger menu:** Slide-in from left, full height, backdrop blur
5. **CTAs:** Full-width buttons on mobile
6. **Cards:** Full-width with 16px horizontal margin
7. **No horizontal scroll:** Ensure all content fits within viewport width

---

## 12. Assets & Media

### Icons

Use **Lucide React** exclusively. Key icons used in the platform:

| Context | Icon Name |
|---|---|
| Dashboard | `LayoutDashboard` |
| DNS / Globe | `Globe` |
| Website | `Database` |
| Team | `Users` |
| Settings | `Settings` |
| Security | `ShieldCheck` |
| Billing | `Briefcase` |
| Support | `LifeBuoy` |
| Success | `CheckCircle2` |
| Error | `AlertCircle` |
| Loading | `Loader2` (with spin animation) |
| Menu | `Menu` |
| Close | `X` |
| Arrow | `ChevronRight`, `ChevronDown` |
| External Link | `ExternalLink` |

### Screenshots & Mockups

For the website, you will need screenshots or mockups of:
1. The full dashboard (Account Home with org table)
2. DNS Management page
3. Website Management page
4. Team Management page
5. Billing / Payment page
6. Mobile view of the dashboard

**Important:** Frame screenshots in a clean, minimal browser window (no OS-specific chrome). Use a subtle shadow: `0px 12px 32px rgba(15,23,42,0.08)` and border-radius `12px`.

### Logo

- Text-based logo: "REVLET" in Space Grotesk, bold, 20px, `#191C1E`, uppercase, tracking `0.1em`
- Below logo (optional): tagline in Inter, 10px, `#64748B` — e.g., "IT Management Platform"

---

## 13. SEO & Performance

### Meta Tags (per page)

```html
<!-- Homepage -->
<title>Revlet — IT Management Platform for Institutions</title>
<meta name="description" content="Manage DNS records, website deployments, team access, and billing for your institution — all from one unified dashboard. Built for IT administrators." />
<meta name="keywords" content="IT management, DNS management, institutional IT, SaaS platform, team management, website deployment" />

<!-- Open Graph -->
<meta property="og:title" content="Revlet — IT Management Platform for Institutions" />
<meta property="og:description" content="One dashboard to manage DNS, websites, teams, and billing across all your institutions." />
<meta property="og:image" content="/og-image.png" />
<meta property="og:url" content="https://revlet.me" />
<meta property="og:type" content="website" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Revlet — IT Management Platform" />
<meta name="twitter:description" content="Unified IT management for institutions." />
```

### Performance Rules

1. **Lazy load images** below the fold using `loading="lazy"` or Intersection Observer
2. **Preload critical fonts** — Space Grotesk 700 and Inter 400
3. **Minimize JavaScript** — the marketing site should be mostly static HTML/CSS
4. **Use semantic HTML** — `<header>`, `<main>`, `<section>`, `<footer>`, `<nav>`, `<article>`
5. **Single H1 per page** — use proper heading hierarchy
6. **Compress images** — use WebP format where possible
7. **Minimize CSS** — use the design tokens defined above, no ad-hoc colors

---

## 14. Do's and Don'ts

### ✅ DO

- **Match the app's visual language exactly** — same colors, fonts, spacing, border radius
- **Use the primary blue (`#2563EB`) as the dominant accent** — it should be the most prominent color after white and slate
- **Use Space Grotesk for all headings** and Inter for all body text — no exceptions
- **Make the value proposition crystal clear above the fold** — what, who, why, how
- **Use real feature descriptions** from Section 10 — no placeholder copy
- **Add hover effects and micro-animations** — the site should feel alive and interactive
- **Use the blue accent bar pattern** on feature cards (4px top border, `primary/20`)
- **Use the section label pattern** (uppercase, 10px, tracking, with horizontal line)
- **Ensure full mobile responsiveness** — test at 375px, 768px, 1024px, 1440px
- **Keep the design clean and professional** — this is a B2B SaaS, not a consumer app
- **Use the established shadow scale** — subtle for cards, glow for CTAs, deeper for modals
- **Add proper spacing between sections** — 48–64px vertical rhythm
- **Use Lucide icons consistently** — no mixing icon libraries

### ❌ DON'T

- **Don't use colors outside the defined palette** — no random reds, greens, or purples
- **Don't use fonts other than Space Grotesk and Inter** — no system defaults, no alternatives
- **Don't use dark mode** — the app doesn't have it, the website shouldn't either
- **Don't use rounded-full on cards or containers** — max radius is `xl` (12px)
- **Don't use placeholder text** ("Lorem ipsum") — all copy must be real and relevant
- **Don't use stock photos** — use screenshots, mockups, icons, or abstract illustrations
- **Don't overcrowd sections** — maintain breathing room with proper spacing
- **Don't use shadows heavier than defined** — the aesthetic is subtle, not dramatic
- **Don't add complex JavaScript interactions** — keep it lightweight (no parallax, no heavy scroll effects)
- **Don't use inline styles** — use CSS classes that reference the design tokens
- **Don't forget the mobile hamburger menu** — navigation must collapse properly
- **Don't ignore the footer** — it should match the app's footer style (uppercase, tracked, slate-400)
- **Don't use TailwindCSS** unless explicitly told to — use vanilla CSS matching the tokens above

---

## Quick Reference Card

```
Primary:      #2563EB (blue)
Foreground:   #191C1E (near-black)
Body Text:    #45464D (dark gray)
Muted:        #64748B (slate)
Background:   #F8FAFC (light blue-gray)
Border:       #E2E8F0 (light slate)
Card:         #FFFFFF (white)
Success:      #10B981 (emerald)
Error:        #EF4444 (red)

Headline Font:  Space Grotesk (700/600/500)
Body Font:      Inter (400/500/600)
Icon Library:   lucide-react

Border Radius:  4px (default), 8px (cards), 12px (large)
Max Width:      1280px (content), centered
Spacing Base:   4px grid

App URL:        app.revlet.me
Website URL:    revlet.me
Contact:        hello@revlet.me
Copyright:      © 2026 REVLET PLATFORM
```
