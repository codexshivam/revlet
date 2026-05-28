
# EduSphere IT Portal

Enterprise IT Management for Educational Institutions.

## Firebase Configuration

### Database ID
The Firestore database ID for this project is: **`(default)`**

### Firestore Security Rules
To ensure users can only access their own institutional data, apply the following security rules in the Firebase Console (Firestore > Rules):

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

### Firestore Indexes
The Account Home dashboard uses a query filtered by `ownerId`. For optimal performance and to enable sorting, create the following index in the Firestore Console (Firestore > Indexes):

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
