import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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
  return key.replace(/\\n/g, "\n");
}

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "[firebase.js] Missing Firebase Admin credentials:",
      { hasProjectId: !!projectId, hasClientEmail: !!clientEmail, hasPrivateKey: !!privateKey }
    );
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export const auth = getAuth();