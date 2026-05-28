
# EduSphere IT Portal

Enterprise IT Management for Educational Institutions.

## Getting Started

### 1. Authorized Domains (CRITICAL)
Since you are using a development domain (Cloud Workstations), you **MUST** add your current URL to the authorized domains in Firebase Console. 

*   Go to **Authentication** > **Settings** > **Authorized domains**.
*   Click **Add domain**.
*   Paste your workstation domain: `9000-firebase-studio-1779875082553.cluster-edb2jv34dnhjisxuq5m7l37ccy.cloudworkstations.dev` (without https://).

### 2. Infrastructure Integration (DNS Management)
To enable real-time domain management for institutions, you must provide a Cloudflare API Token.

1.  **Generate Token**: Go to your [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens).
2.  **Create Token**: Use the "Edit zone DNS" template.
3.  **Environment Variable**: Add the token to your `.env.local` file:
    ```bash
    CLOUDFLARE_API_TOKEN=your_token_here
    ```

### 3. Database Setup
Ensure your Firestore Security Rules match the requirements in the `docs/backend.json` structure to allow users to manage their own organizations and financial records.

## Features
- **Account Home**: Manage multiple educational institutions from a single dashboard.
- **Domain Management**: Real-time DNS control with security shields and global propagation.
- **Financial Portal**: Track institutional balances and submit payment proof.
- **Team Access**: Invite staff to help manage specific organizations.
