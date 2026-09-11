import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Normalizes FIREBASE_PRIVATE_KEY regardless of how it's stored:
//   - Strips surrounding quote characters, in case the env var value
//     literally includes a leading/trailing " (some dashboards add this
//     when displaying/exporting multi-line secrets).
//   - Converts literal "\n" (backslash-n text) into real newlines, which
//     is how most platforms require multi-line PEM keys to be pasted
//     into a single-line env var field.
//   - If the value already contains real newlines (rare, but possible if
//     pasted directly), leaves them as-is.
function normalizePrivateKey(raw) {
  if (!raw) return raw;
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n');
}

let firebaseAuth = null;
let firebaseInitializationError = null;

try {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase Admin credentials are incomplete.');
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  firebaseAuth = getAuth();
} catch (error) {
  firebaseInitializationError = error;
  console.error('[firebase.js] Firebase Admin initialization failed:', error.message);
}

export function getFirebaseAuth() {
  if (firebaseAuth) return firebaseAuth;

  const error = new Error('Firebase Authentication is temporarily unavailable.');
  error.code = 'FIREBASE_UNAVAILABLE';
  error.status = 503;
  error.cause = firebaseInitializationError;
  throw error;
}