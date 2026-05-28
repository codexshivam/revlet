
# EduSphere IT Portal

Enterprise IT Management for Educational Institutions.

## Firebase Configuration

### 1. Authorized Domains (CRITICAL)
Since you are using a development domain (Cloud Workstations), you **MUST** add your current URL to the authorized domains in Firebase Console. 

*   Go to **Authentication** > **Settings** > **Authorized domains**.
*   Click **Add domain**.
*   Paste your workstation domain: `9000-firebase-studio-1779875082553.cluster-edb2jv34dnhjisxuq5m7l37ccy.cloudworkstations.dev` (without https://).

### 2. Database ID
The Firestore database ID for this project is: **`(default)`**

### 3. Firestore Security Rules
Apply these rules in **Firestore > Rules** to ensure data isolation. These rules allow users to only see and modify their own data.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /organizations/{orgId} {
      allow read, update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
    }
    match /paymentVouchers/{voucherId} {
      allow read, create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
    }
    match /teamMembers/{memberId} {
      allow read, create, update: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
    }
  }
}
```

## Infrastructure Integration (Cloudflare)

To enable DNS and domain management features, you must provide a Cloudflare API Token.

1.  **Generate Token**: Go to your Cloudflare Dashboard -> My Profile -> API Tokens. Create a token with "Edit Zone DNS" permissions for all zones (or specific ones).
2.  **Environment Variable**: Create a `.env.local` file in the root of the project and add:
    ```bash
    CLOUDFLARE_API_TOKEN=your_api_token_here
    ```
    This token is used by server-side actions and is never exposed to the client.

## Getting Started

1.  **Configure Firebase**: Update `src/firebase/config.ts` with your actual project credentials from the Firebase Console.
2.  **Enable Services**:
    *   Enable **Authentication** (Email/Password provider).
    *   Enable **Cloud Firestore** in Native Mode.
3.  **Run Locally**:
    ```bash
    npm install
    npm run dev
    ```

## Features
- **Account Home**: Real-time Firestore synchronization with owner-based isolation.
- **DNS Management**: Simple CRUD for domain records with edge protection.
- **Team Management**: Staff invitation and organization assignment.
- **Billing**: Payment voucher submission and balance tracking.
