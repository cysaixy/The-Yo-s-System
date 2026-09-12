import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded regardless of execution working directory
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Normalizes FIREBASE_PRIVATE_KEY regardless of how it's stored:
//   - Strips surrounding single or double quotes
//   - Converts literal "\n" or "\r\n" into real newlines
function normalizePrivateKey(raw) {
  if (!raw) return raw;
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  return key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

let firebaseAuth = null;
let firebaseInitializationError = null;

function initFirebase() {
  if (firebaseAuth) return firebaseAuth;

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

    if (!projectId || !clientEmail || !privateKey) {
      const missing = [];
      if (!projectId) missing.push('FIREBASE_PROJECT_ID');
      if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
      if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
      throw new Error(`Firebase Admin credentials are incomplete. Missing: ${missing.join(', ')}`);
    }

    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    firebaseAuth = getAuth();
    firebaseInitializationError = null;
    return firebaseAuth;
  } catch (error) {
    firebaseInitializationError = error;
    console.error('[firebase.js] Firebase Admin initialization failed:', error.message);
    throw error;
  }
}

// Attempt eager initialization, but don't fail permanently if env vars are loaded later
try {
  initFirebase();
} catch (_) {}

export function getFirebaseAuth() {
  if (firebaseAuth) return firebaseAuth;
  return initFirebase();
}