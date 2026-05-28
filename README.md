
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
      // Allow read, update, or delete only if the user is the owner
      allow read, update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
      
      // Allow creation if the user is authenticated and sets themselves as the owner
      allow create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
    }
  }
}
```

### 4. Firestore Indexes
Create this index in **Firestore > Indexes** for the dashboard queries:

*   **Collection ID**: `organizations`
*   **Fields**:
    *   `ownerId`: Ascending
    *   `createdAt`: Descending
*   **Query Scope**: Collection

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
- **Centralized Dashboard**: Real-time Firestore synchronization with owner-based isolation.
- **DNS Management**: Full CRUD for authoritative record types.
- **Service Provisioning**: Integrated workflows for Workspace and Hosting.
- **Secure Authentication**: Robust Firebase Auth integration with profile management.
