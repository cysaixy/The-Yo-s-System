// src/middlewares/auth.middleware.js
import { auth } from "../config/firebase.js";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

// Firebase Token Middleware for Customers
export async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Token missing." });
  }

  const token = authHeader.split(" ")[1];

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(503).json({ error: "Customer authentication is not configured on this server." });
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const { uid, email } = decodedToken;

    const customer = await prisma.customer.findUnique({
      where: { firebaseUid: uid },
      select: { id: true, name: true, email: true, phone: true },
    });

    req.user = {
      firebaseUid: uid,
      email,
      customer: customer || null,
    };

    next();
  } catch (error) {
    console.error("Firebase Token Error:", error.message);
    return res.status(401).json({ error: "Unauthorized. Invalid or expired token." });
  }
}

// Staff/Admin Auth Middleware — verifies the JWT issued by
// generateStaffToken({ staffId }), loads the staff row (permissions now
// direct boolean columns), and attaches it as req.staff for requireAdmin/
// requirePermission and every controller that reads req.staff.id.
export async function requireStaffAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Staff login required." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const staff = await prisma.staff.findUnique({
      where: { id: decoded.staffId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        canAccessInventory: true,
        canAccessStockIn: true,
        canAccessReports: true,
      },
    });

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