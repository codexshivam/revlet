# EduSphere IT Portal

Enterprise IT Management for Educational Institutions.

## Firebase Configuration

### Database ID
The Firestore database ID for this project is: **`(default)`**

### Firestore Security Rules
To ensure users can only access their own institutional data, apply the following security rules in the Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /organizations/{orgId} {
      // Allow users to read, update, or delete only if they are the owner
      allow read, update, delete: if request.auth != null && resource.data.ownerId == request.auth.uid;
      
      // Allow creation if the user is authenticated and sets themselves as the owner
      allow create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
    }
  }
}
```

### Firestore Indexes
The "Account Home" screen uses a composite query to list organizations. You must create the following index in the Firestore "Indexes" tab:

*   **Collection ID**: `organizations`
*   **Fields**:
    *   `ownerId`: Ascending
    *   `createdAt`: Descending
*   **Query Scope**: Collection

## Getting Started

1.  **Configure Firebase**: Update `src/firebase/config.ts` with your actual project credentials.
2.  **Enable Services**:
    *   Enable **Authentication** (Email/Password provider).
    *   Enable **Cloud Firestore** in Native Mode.
3.  **Run Locally**:
    ```bash
    npm install
    npm run dev
    ```

## Features
- **Centralized Dashboard**: Real-time Firestore synchronization for managed organizations.
- **DNS Management**: Full CRUD for A, AAAA, CNAME, MX, TXT, NS, SRV, and CAA records.
- **Service Provisioning**: Integrated workflows for Google Workspace and Managed Hosting.
- **Secure Authentication**: Robust Firebase Auth integration with user-friendly error handling.
- **Administrative Settings**: Self-service profile updates and security management.
