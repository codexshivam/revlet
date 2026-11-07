# Security Policy

Revlet is designed to orchestrate mission-critical cloud infrastructure, DNS networks, and institutional identity directories. We take security, data integrity, and multi-tenant isolation seriously.

---

## Supported Versions

We provide active security patches and vulnerability fixes for the following versions:

| Version | Supported |
| :--- | :--- |
| `0.1.x` (main branch) | :white_check_mark: |
| Older releases | :x: |

---

## Reporting a Vulnerability

If you discover a security vulnerability or weakness within Revlet, please **do not report it through public GitHub issues or public discussions**.

### Preferred Reporting Method
Please disclose vulnerabilities privately using one of the following methods:
1. **GitHub Security Advisory**: Go to the [Security Advisories tab](https://github.com/codexshivam/revlet/security/advisories) and click **"New draft advisory"**.
2. **Direct Maintainer Contact**: If GitHub Advisories are unavailable, contact the project maintainers directly via email at `security@revlet.me` or through the project lead's profile.

### What to Include in Your Report
To help us triage and resolve the issue quickly, please provide:
* A clear description of the vulnerability and its potential impact.
* Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
* Any affected components, endpoints, or Server Actions (e.g., `verifyUserOrgAccess`, `cloudflare-dns.ts`, `google-workspace.ts`).
* Remediation suggestions, if known.

### Response Timelines & SLA
* **Initial Acknowledgment**: Within 48 hours of report receipt.
* **Triage & Assessment**: Within 5 business days.
* **Patch Development & Release**: High and critical severity vulnerabilities will be prioritized for expedited patch releases.
* **Public Disclosure**: Coordinated disclosure will occur only after a verified fix has been deployed and verified.

---

## Threat Model & Security Posture

Revlet enforces strict Defense-in-Depth principles across multiple operational boundaries:

### 1. Multi-Tenant Isolation & Anti-IDOR Protections
* Every Server Action interacting with upstream cloud providers (Cloudflare API v4, Google Workspace Admin SDK) must pass through `verifyUserOrgAccess`.
* Tenancy checks cryptographically verify the caller's Firebase session and assert resource ownership (`ownerId == uid`) or active team membership before authorizing mutations.
* Zone hijacking protections prevent an authenticated tenant from passing an arbitrary `zoneId` belonging to another organization.

### 2. Upstream Credential Quarantine
* Upstream API credentials (Cloudflare DNS bearer tokens, Google Workspace Service Account keys, Firebase Admin credentials) are restricted to server-side runtimes.
* They are never exposed to browser clients, bundled in JavaScript outputs, or included in client hydration state.

### 3. Database & Storage Rules
* Direct client-side modifications to sensitive database fields (`ownerId`, `cloudflareZoneId`, `plan`, `workspaceStatus`) are blocked by declarative rules in `firestore.rules`.
* Object uploads in `storage.rules` enforce strict per-tenant isolation, MIME type verification (images, PDF vouchers), and 10MB payload size limits.

### 4. HTTP Transport Security
* Enterprise security headers are enforced via `next.config.ts`, including:
  * Strict Content Security Policy (CSP)
  * HTTP Strict Transport Security (HSTS) with 2-year `max-age` and preload
  * `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` to prevent clickjacking
  * `X-Content-Type-Options: nosniff` to prevent MIME-type sniffing

---

## Out of Scope

The following issues are generally considered outside the scope of our security vulnerability program:
* Attacks requiring physical access to an authenticated user's unlocked machine.
* Denial-of-Service attacks against local development servers (`http://localhost:9002`).
* Volumetric rate-limit exhaustion against public sandbox environments.
* Non-security UX choices or missing functional features.

---

## Security Verification Commands

Contributors can run local security checks using the built-in audit script:

```bash
# Run critical vulnerability audit, TypeScript verification, and Next.js linting
npm run security:check
```
