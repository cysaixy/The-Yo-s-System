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

// Normalizes FIREBASE_PRIVATE_KEY regardless of how it's stored or escaped across platforms:
//   - Strips surrounding quotes ('...' or "...")
//   - Handles entire JSON service account blobs
//   - Handles base64 encoded strings
//   - Unescapes literal single (\n) and double (\\n) backslash newlines
//   - Reconstructs valid 64-char PEM lines when newlines were collapsed to spaces by web forms
function normalizePrivateKey(raw) {
  if (!raw) return raw;
  let key = raw.trim();

  // If entire service account JSON was pasted into FIREBASE_PRIVATE_KEY
  if (key.startsWith('{') && key.endsWith('}')) {
    try {
      const parsed = JSON.parse(key);
      if (parsed.private_key) {
        if (!process.env.FIREBASE_PROJECT_ID && parsed.project_id) {
          process.env.FIREBASE_PROJECT_ID = parsed.project_id;
        }
        if (!process.env.FIREBASE_CLIENT_EMAIL && parsed.client_email) {
          process.env.FIREBASE_CLIENT_EMAIL = parsed.client_email;
        }
        return normalizePrivateKey(parsed.private_key);
      }
    } catch (_) {}
  }

  // Strip wrapping single or double quotes
  while ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  // Handle base64 encoded whole key or JSON
  if (!key.includes('BEGIN') && key.length > 500) {
    try {
      const decoded = Buffer.from(key, 'base64').toString('utf8');
      if (decoded.includes('BEGIN PRIVATE KEY') || decoded.startsWith('{')) {
        return normalizePrivateKey(decoded);
      }
    } catch (_) {}
  }

  // Replace literal escaped newlines (both single \n and double \\n)
  key = key.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '');

  // Detect PEM header and footer
  const headerMatch = key.match(/-----BEGIN [A-Z ]+KEY-----/);
  const footerMatch = key.match(/-----END [A-Z ]+KEY-----/);

  if (headerMatch && footerMatch) {
    const header = headerMatch[0];
    const footer = footerMatch[0];
    const headerIdx = key.indexOf(header);
    const footerIdx = key.indexOf(footer);

    if (headerIdx !== -1 && footerIdx !== -1 && footerIdx > headerIdx) {
      const rawBody = key.slice(headerIdx + header.length, footerIdx);
      // Clean body of all non-base64 characters (spaces, linebreaks, backslashes)
      const cleanBody = rawBody.replace(/[^A-Za-z0-9+/=]/g, '');
      const chunks = cleanBody.match(/.{1,64}/g) || [];
      return `${header}\n${chunks.join('\n')}\n${footer}\n`;
    }
  }

  // If user pasted raw base64 without headers (PKCS#8 starting with MII)
  const cleanBody = key.replace(/[^A-Za-z0-9+/=]/g, '');
  if (cleanBody.startsWith('MII') && cleanBody.length > 500) {
    const chunks = cleanBody.match(/.{1,64}/g) || [];
    return `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----\n`;
  }

  return key;
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