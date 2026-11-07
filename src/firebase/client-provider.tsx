'use client';

import React, { useState } from 'react';
import { initializeFirebase } from './index';
import { FirebaseProvider } from './provider';
import { FirebaseApp } from 'firebase/app';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';
import { OrgProvider } from '@/hooks/use-active-org';

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const [instances] = useState<{
    app: FirebaseApp;
    auth: Auth;
    db: Firestore;
  }>(() => initializeFirebase());

  return (
    <FirebaseProvider app={instances.app} auth={instances.auth} db={instances.db}>
      <OrgProvider>
        {children}
      </OrgProvider>
    </FirebaseProvider>
  );
}
