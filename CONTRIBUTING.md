# Contributing to Revlet

Thank you for your interest in contributing to **Revlet**! As an open-source cloud control plane for organizations, teams, and administrators, we welcome thoughtful contributions from developers, systems engineers, and documentation contributors of all experience levels.

Please take a moment to review this document before submitting issues, feature suggestions, or pull requests. All contributions are made under the terms of our [Apache-2.0 License](LICENSE).

---

## Code of Conduct

All contributors and maintainers are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please ensure respectful and constructive collaboration at all times.

---

## How Can I Contribute?

### 1. Reporting Bugs
* Search the [GitHub Issue Tracker](https://github.com/codexshivam/revlet/issues) first to avoid duplicate reports.
* When opening an issue, please use a clear title and include:
  * A detailed description of the unexpected behavior.
  * Exact steps to reproduce the issue.
  * Your operating system, Node.js version, and browser environment.
  * Relevant terminal logs or browser console traces (make sure to sanitize private tokens, API keys, or domain credentials!).

### 2. Suggesting Enhancements
* Open an issue with the label `enhancement`.
* Explain the problem or workflow inefficiency your suggestion solves.
* Describe the intended outcome, expected user interface, or API additions.

### 3. Submitting Pull Requests (PRs)
1. Fork the repository and create your feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Ensure your changes follow our coding conventions and security standards.
3. Test thoroughly in local development before committing.
4. Run all verification checks:
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```
5. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat(dns): add bulk SRV record validation"
   ```
6. Push to your fork and submit a Pull Request against the `main` branch.

---

## Development Workflow

### Prerequisites
* **Node.js**: `v20.x` or later (LTS recommended)
* **npm**: `v10.x` or later
* Git

### Local Setup
```bash
# 1. Clone your fork
git clone https://github.com/YOUR_USERNAME/revlet.git
cd revlet

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local

# 4. Start development server
npm run dev
```

Visit [http://localhost:9002](http://localhost:9002) to verify your local build.

---

## Coding Standards

* **TypeScript**: Strict type checking is enabled. Avoid using `any` unless absolutely necessary; declare precise types or interfaces.
* **Architecture**:
  * Client components reside under `src/components/` and client pages under `src/app/`.
  * Sensitive third-party API interactions (DNS providers, Stalwart Mail, Amazon SES, Firebase Admin) must execute in authenticated Server Actions (`src/app/actions/`) and enforce tenancy and granular permissions via `verifyUserOrgAccess`.
  * Maintain clean separation between client hooks (`useActiveOrg`) and backend mutation logic.
* **Styling**: Use Tailwind CSS utility classes. Ensure accessible color contrast and verify responsive layouts for mobile and desktop screens.
* **Component Library**: Utilize Radix UI headless primitives for complex accessible dialogs, popovers, and dropdowns.

---

## Commit Message Conventions

We strictly follow the Conventional Commits specification:

| Prefix | Description | Example |
| :--- | :--- | :--- |
| `feat:` | A new user-facing feature or API capability | `feat(email): add bulk CSV mailbox import` |
| `fix:` | A bug fix | `fix(dns): resolve pagination reset on filter change` |
| `docs:` | Documentation updates or README enhancements | `docs: update onboarding and environment guide` |
| `refactor:` | Code changes that neither fix bugs nor add features | `refactor(ui): share table pagination component` |
| `style:` | Formatting, whitespace, or UI styling polish | `style(team): improve dialog scroll behavior` |
| `test:` | Adding or updating tests | `test(auth): verify SNS webhook signature checks` |
| `chore:` | Dependency upgrades or tooling configuration | `chore: update next.js to latest patch release` |

---

## Security & Credential Hygiene

Revlet manages cloud infrastructure and messaging. Security and zero-trust isolation are paramount:
* **Never commit credentials**: Never check in `.env.local`, API bearer tokens, private keys, service account JSON files, or customer passwords.
* **Prevent IDOR**: When creating or modifying server actions, always invoke `verifyUserOrgAccess` with appropriate permission scopes to assert that the authenticated user owns or has authorized access to the target organization.
* **Security Audits**: Run `npm run typecheck`, `npm run lint`, and `npm run build` before submitting pull requests.

If you discover a security vulnerability, please do **not** open a public issue. Follow our [Security Policy](SECURITY.md) to report it responsibly.
