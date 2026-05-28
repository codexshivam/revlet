
# EduSphere IT Portal

Enterprise IT Management for Educational Institutions.

## Getting Started

### 1. Authorized Domains (CRITICAL)
Since you are using a development domain, you **MUST** add your current URL to the authorized domains in Firebase Console. 

*   Go to **Authentication** > **Settings** > **Authorized domains**.
*   Click **Add domain**.
*   Paste your workstation domain: `9000-firebase-studio-1779875082553.cluster-edb2jv34dnhjisxuq5m7l37ccy.cloudworkstations.dev` (without https://).

### 2. Infrastructure Integration (DNS Management)
The platform uses a dual-token security model. You must provide Cloudflare API Tokens in your `.env.local` file:

1.  **DNS Token**: Scoped for "Edit zone DNS" permissions (CRUD operations).
2.  **Infra Token**: Scoped for "Read zone" and "Read zone settings" (Status checks).

```bash
CLOUDFLARE_DNS_TOKEN=your_dns_edit_token_here
CLOUDFLARE_INFRA_TOKEN=your_infrastructure_read_token_here
```

### 3. Database Setup (Firestore)
1.  **Enable Firestore**: Go to the Firebase Console and create a Firestore database in "Production Mode".
2.  **Apply Rules**: Copy the contents of `firestore.rules` from this project and paste them into the **Rules** tab of your Firestore console.
3.  **Indexing**: Firestore will automatically prompt you to create indexes if you perform complex queries. Follow the links provided in the console logs if needed.

### 4. Activating Institutional DNS
To prevent unauthorized access, users cannot add domains to Cloudflare themselves. The workflow is:
1.  **User Request**: The user clicks "Activate DNS Management" in the portal.
2.  **Admin Assignment**: You (as the platform owner) must manually add the domain to your Cloudflare account.
3.  **Assign Zone ID**: Find the `cloudflareZoneId` in your Cloudflare dashboard and paste it into the specific document in the `organizations` collection in Firestore.
4.  **Unlock**: Once the `cloudflareZoneId` is present, the user's DNS management dashboard will automatically unlock. The assigned global nodes will be displayed, and record management will become available once propagation is complete.

## Features
- **Account Home**: Manage multiple educational institutions from a single dashboard.
- **DNS Records**: Professional management of A, CNAME, MX, and TXT records with proxy toggles.
- **Financial Portal**: Track institutional balances and submit payment proof.
- **Team Access**: Invite staff to help manage specific organizations.
