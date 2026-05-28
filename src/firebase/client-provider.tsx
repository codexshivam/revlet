
'use client';

import React, { useEffect, useState } from 'react';
import { initializeFirebase } from './index';
import { FirebaseProvider } from './provider';
import { FirebaseApp } from 'firebase/app';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const [instances, setInstances] = useState<{
    app: FirebaseApp;
    auth: Auth;
    db: Firestore;
  } | null>(null);

  useEffect(() => {
    const { app, auth, db } = initializeFirebase();
    setInstances({ app, auth, db });
  }, []);

  if (!instances) return null;

  return (
    <FirebaseProvider app={instances.app} auth={instances.auth} db={instances.db}>
      {children}
    </FirebaseProvider>
  );
}
