
# EduSphere IT Portal

Enterprise IT Management for Educational Institutions.

## Getting Started

### 1. Authorized Domains (CRITICAL)
Since you are using a development domain (Cloud Workstations), you **MUST** add your current URL to the authorized domains in Firebase Console. 

*   Go to **Authentication** > **Settings** > **Authorized domains**.
*   Click **Add domain**.
*   Paste your workstation domain: `9000-firebase-studio-1779875082553.cluster-edb2jv34dnhjisxuq5m7l37ccy.cloudworkstations.dev` (without https://).

### 2. Infrastructure Integration (DNS Management)
To enable real-time domain management for institutions, you must provide Cloudflare API Tokens.

1.  **Generate Tokens**: Go to your [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens).
2.  **DNS Token**: Create a token with "Edit zone DNS" permissions for the relevant account.
3.  **Infra Token**: Create a token with "Read zone" and "Read zone settings" permissions for status checks.
4.  **Environment Variables**: Add the tokens to your `.env.local` file:
    ```bash
    CLOUDFLARE_DNS_TOKEN=your_dns_edit_token_here
    CLOUDFLARE_INFRA_TOKEN=your_infrastructure_read_token_here
    ```

### 3. Database Setup
Ensure your Firestore Security Rules match the requirements in the `docs/backend.json` structure to allow users to manage their own organizations and financial records.

## Features
- **Account Home**: Manage multiple educational institutions from a single dashboard.
- **Domain Management**: Real-time DNS control with security shields and global propagation.
- **Financial Portal**: Track institutional balances and submit payment proof.
- **Team Access**: Invite staff to help manage specific organizations.
