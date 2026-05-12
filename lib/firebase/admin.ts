import "server-only";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const localAdminCredentialMessage =
  "Firebase Admin credentials are not configured for this local server. " +
  "Add FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY to .env.local, set " +
  "GOOGLE_APPLICATION_CREDENTIALS to a Firebase service account JSON path, " +
  "or run `gcloud auth application-default login`. Restart `npm run dev` after changing credentials.";

function getAdminApp() {
  const existingApp = getApps()[0];

  if (existingApp) {
    return existingApp;
  }

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;
  const storageBucket = getStorageBucket();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  // Local development can use explicit service-account fields from .env.local.
  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
      storageBucket,
    });
  }

  // Firebase App Hosting and GOOGLE_APPLICATION_CREDENTIALS use ADC.
  return initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket,
  });
}

function getStorageBucket() {
  if (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) {
    return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  }

  if (!process.env.FIREBASE_CONFIG) {
    return undefined;
  }

  try {
    // App Hosting exposes runtime Firebase config as a JSON string.
    const config = JSON.parse(process.env.FIREBASE_CONFIG) as { storageBucket?: string };
    return config.storageBucket;
  } catch {
    return undefined;
  }
}

export const adminApp = getAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp);

export function getFirebaseAdminError(error: unknown) {
  // Translate ADC setup failures into a project-specific local setup message.
  if (isMissingDefaultCredentialError(error)) {
    return new Error(localAdminCredentialMessage);
  }

  return error;
}

function isMissingDefaultCredentialError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("Could not load the default credentials") ||
    message.includes("Unable to detect a Project Id")
  );
}
