// src/middlewares/auth.middleware.js
import { auth } from "../config/firebase.js";
import pool from "../config/db.js";

// Firebase Token Middleware for Customers
export async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Token missing." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const { uid, email } = decodedToken;

    const { rows } = await pool.query(
      "SELECT id, name, email, phone, address FROM customers WHERE firebase_uid = $1",
      [uid]
    );

    req.user = {
      firebaseUid: uid,
      email,
      customer: rows[0] || null,
    };

    next();
  } catch (error) {
    console.error("Firebase Token Error:", error.message);
    return res.status(401).json({ error: "Unauthorized. Invalid or expired token." });
  }
}

// Staff/Admin Auth Middleware
export function requireStaffAuth(req, res, next) {
  if (req.session && req.session.staff) {
    return next();
  }

  if (req.headers["x-staff-id"]) {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized. Staff login required." });
}