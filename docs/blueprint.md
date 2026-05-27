# EduSphere IT Portal Blueprint

## 1. Project Overview
**EduSphere IT Portal** is a high-density B2B SaaS multi-tenant infrastructure management platform designed for educational institutions. It allows administrators to manage domains, websites, Google Workspace deployments, and institutional billing.

## 2. Technical Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **UI/UX**: ShadCN UI + Tailwind CSS
- **Design Pattern**: High information density, professional SaaS aesthetic.
- **Typography**:
  - **Headlines**: Space Grotesk
  - **Body**: Inter
- **AI Engine**: Genkit (Pre-configured for Google AI/Gemini)

## 3. Global Design DNA
- **Container**: The entire application is wrapped in a macOS-inspired window frame (`DashboardShell`) with top-left window controls.
- **Theme**: Light mode with deep white backgrounds (#FFFFFF) and ultra-light grey cards (#F8FAFC).
- **Navigation**:
  - **Top Header**: Search bar and Support triggers.
  - **Left Sidebar**: Collapsible, multi-tiered tree navigation.
- **Accents**: Interactive primary blue (#2563EB) used for primary actions and highlights.

## 4. Feature Architecture & Navigation
### ACCOUNT
- **Account Home**: Central dashboard for the active IT Administrator. Features an editable profile header and a unified institution table.
- **Manage Payments**: Financial ledger displaying pending NPR balances and historical invoices. Includes a "Submit Payment" modal with bank details and voucher upload functionality.

### ORGANIZATIONS
- **Organization Directory**: A comprehensive table of all managed institutions, their domains, and active services.

### SERVICES (Context-Aware)
*All service pages include a persistent "Organization Selector" widget to toggle institutional context.*
- **DNS Management**: CRUD interface for managing A, CNAME, MX, and TXT records.
- **Website Management**: A 4-state machine governing UI rendering:
  1. `not_found`: Setup initialization.
  2. `external`: External hosting info with upgrade path.
  3. `waiting_for_changes`: Locked state during deployment.
  4. `ready_and_published`: Operational panel with change quotas and request history.
- **Google Workspace**: A 3-state deployment machine:
  1. `Unregistered`: Benefits highlight and application trigger.
  2. `Pending`: Locked state during Google verification.
  3. `Active`: Full management dashboard with storage metrics.

### MANAGEMENT
- **Team Management**: RBAC (Role-Based Access Control) table for IT staff (Admin, IT Support, Billing Manager).
- **Settings**: Security controls for administrative email and password updates.

## 5. Implementation Status
- **Auth Flow**: Fully implemented Login, Signup, and Forgot Password pages with professional spacing and shadows.
- **Layout**: `DashboardShell` provides consistent navigation and layout across all routes.
- **Components**: Utilizes customized ShadCN components for tables, badges, and modals to maintain the high-density professional look.
- **Data Model**: Strictly enforces a 1-organization to 1-domain mapping for simplified infrastructure oversight.
