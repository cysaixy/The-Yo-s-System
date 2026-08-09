// src/middlewares/auth.middleware.js
import { auth } from "../config/firebase.js";
import jwt from "jsonwebtoken";
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

// Staff/Admin Auth Middleware — verifies the JWT issued by
// generateStaffToken({ staffId }), loads the staff row + permissions, and
// attaches it as req.staff for requireAdmin/requirePermission and every
// controller that reads req.staff.id.
export async function requireStaffAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Staff login required." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.email, s.role, s.status,
              p.can_access_inventory, p.can_access_stock_in, p.can_access_reports
       FROM staff s
       LEFT JOIN staff_permissions p ON p.staff_id = s.id
       WHERE s.id = $1`,
      [decoded.staffId]
    );
    const staff = rows[0];

    if (!staff || staff.status !== "active") {
      return res.status(401).json({ error: "Unauthorized. Staff account not found or inactive." });
    }

    req.staff = staff;
    next();
  } catch (error) {
    console.error("Staff Token Error:", error.message);
    return res.status(401).json({ error: "Unauthorized. Invalid or expired token." });
  }
}