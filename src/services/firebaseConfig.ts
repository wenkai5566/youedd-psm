import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { DEFAULT_ALLOWED_STAFF_EMAILS } from '../constants/seedData';
import { normalizeEmail } from '../domain/bookingLogic';
import type { BackendMode } from '../types/domain';

const firebaseEnvConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || '',
};

/**
 * Determines whether Firebase environment credentials are fully configured.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseEnvConfig.apiKey &&
      firebaseEnvConfig.authDomain &&
      firebaseEnvConfig.projectId &&
      firebaseEnvConfig.appId
  );
}

/**
 * Returns the active backend mode based on environment configuration.
 */
export function getBackendMode(): BackendMode {
  return isFirebaseConfigured() ? 'firebase' : 'demo';
}

/**
 * Parses the bootstrap staff email whitelist from VITE_ALLOWED_STAFF_EMAILS (capped at 5).
 */
export function getEnvAllowedEmails(): string[] {
  const raw = import.meta.env.VITE_ALLOWED_STAFF_EMAILS?.trim();
  if (!raw) {
    return DEFAULT_ALLOWED_STAFF_EMAILS;
  }
  const parsed: string[] = raw
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);
  return Array.from(new Set<string>(parsed)).slice(0, 5);
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let cachedGoogleProvider: GoogleAuthProvider | null = null;

/**
 * Lazily initializes Firebase App, Google Auth, and Firestore with multi-tab offline persistence.
 */
export function getFirebaseServices(): {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  googleProvider: GoogleAuthProvider;
} {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase credentials are not configured in environment variables.');
  }

  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseEnvConfig);
  }
  if (!cachedAuth) {
    cachedAuth = getAuth(cachedApp);
  }
  if (!cachedDb) {
    try {
      cachedDb = initializeFirestore(cachedApp, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      cachedDb = getFirestore(cachedApp);
    }
  }
  if (!cachedGoogleProvider) {
    cachedGoogleProvider = new GoogleAuthProvider();
    cachedGoogleProvider.setCustomParameters({ prompt: 'select_account' });
  }

  return {
    app: cachedApp,
    auth: cachedAuth,
    db: cachedDb,
    googleProvider: cachedGoogleProvider,
  };
}
