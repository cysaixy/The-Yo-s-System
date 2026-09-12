// src/middlewares/auth.middleware.js
import { getFirebaseAuth } from '../config/firebase.js';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const COOKIE_NAME = 'staff_token';

// Firebase Token Middleware for Customers
export async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Token missing.' });
  }

  const token = authHeader.split(' ')[1];

  let decodedToken;
  try {
    const auth = getFirebaseAuth();
    decodedToken = await auth.verifyIdToken(token);
  } catch (error) {
    console.error('Firebase Token Error:', error.message);
    if (error.message?.includes('Firebase Admin credentials are incomplete') || error.code === 'FIREBASE_UNAVAILABLE') {
      return res.status(503).json({
        error: 'Authentication service is not configured on the server.',
        details: error.message,
      });
    }

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Your session has expired. Please refresh your session.',
        code: 'TOKEN_EXPIRED',
      });
    }

    return res.status(401).json({
      error: 'Unauthorized. Invalid or expired token.',
      code: error.code || 'TOKEN_INVALID',
    });
  }

  try {
    const { uid, email } = decodedToken;

    const { rows } = await pool.query(
      'SELECT id, name, email, phone, address FROM customers WHERE firebase_uid = $1',
      [uid]
    );

    req.user = {
      firebaseUid: uid,
      email,
      customer: rows[0] || null,
    };

    next();
  } catch (dbError) {
    console.error('Customer DB lookup error:', dbError.message);
    return res.status(500).json({ error: 'Database error verifying customer account.' });
  }
}

// Staff/Admin Auth Middleware — verifies the JWT from httpOnly cookie,
// loads the staff row + permissions, and attaches it as req.staff
export async function requireStaffAuth(req, res, next) {
  // Try to get token from cookie first, fallback to Authorization header for backward compat
  const token = req.cookies?.[COOKIE_NAME] || 
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Staff login required.' });
  }

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

    if (!staff || staff.status !== 'active') {
      return res.status(401).json({ error: 'Unauthorized. Staff account not found or inactive.' });
    }

    req.staff = staff;
    next();
  } catch (error) {
    console.error('Staff Token Error:', error.message);
    return res.status(401).json({ error: 'Unauthorized. Invalid or expired token.' });
  }
}