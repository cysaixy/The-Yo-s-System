// firebase-init.js
// Shared Firebase app/auth instance used across account.html, order.html,
// and my-orders.html. Keeping this in one place means the config and
// providers only need to be edited once.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBwyalxDWbaHQ04EibuwYYdCjUCcFsypm0",
  authDomain: "the-yo-s.firebaseapp.com",
  projectId: "the-yo-s",
  storageBucket: "the-yo-s.firebasestorage.app",
  messagingSenderId: "230867291359",
  appId: "1:230867291359:web:2c3233938e43938e05ed6a",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export const API_BASE_URL = "http://localhost:3000";

export {
  auth,
  googleProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updatePassword,
};

// Syncs the Firebase-authenticated user's profile fields (name, phone,
// address) into the customers row via the backend. Safe to call every time
// someone signs in — the backend upserts, and COALESCE means blank fields
// won't overwrite existing saved values.
export async function syncCustomerProfile(idToken, profileFields = {}) {
  const res = await fetch(`${API_BASE_URL}/api/customer/auth/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(profileFields),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not sync your profile.");
  return data.customer;
}