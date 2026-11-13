// src/middlewares/auth.middleware.js
import { getFirebaseAuth } from '../config/firebase.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/db.js';
import {
  getJwtSecret,
  passwordFingerprint,
  STAFF_TOKEN_ISSUER,
  STAFF_TOKEN_AUDIENCE,
} from '../utils/generateToken.js';

export const STAFF_COOKIE_NAME = 'staff_token';

// Verifies a staff session token and returns the live staff row, or null.
// Shared by requireStaffAuth and the customer-side "one session per browser"
// guard below.
export async function resolveStaffSession(token) {
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: STAFF_TOKEN_ISSUER,
      audience: STAFF_TOKEN_AUDIENCE,
    });
  } catch {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.email, s.role, s.status, s.password,
            p.can_access_inventory, p.can_access_stock_in, p.can_access_reports
     FROM staff s
     LEFT JOIN staff_permissions p ON p.staff_id = s.id
     WHERE s.id = $1`,
    [decoded.staffId]
  );
  const staff = rows[0];
  if (!staff || staff.status !== 'active') return null;

  // Password changed/reset since this token was issued → session revoked.
  const expected = Buffer.from(passwordFingerprint(staff.password));
  const actual = Buffer.from(String(decoded.pwv || ''));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  delete staff.password;
  return staff;
}

// True when Firebase Admin failed because ITS OWN credentials are bad
// (not because the customer's token is bad).
export function isCredentialError(err) {
  const text = `${err?.code || ''} ${err?.message || ''}`;
  return /invalid_grant|invalid-credential|Invalid JWT Signature|Failed to parse private key|credentials are incomplete|OAuth2 access token/i.test(text);
}

// Firebase Token Middleware for Customers
export async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Token missing.' });
  }

  // One identity per browser: a live staff session must not also act as a
  // customer. The staff cookie is httpOnly, so only the server can see it.
  try {
    if (await resolveStaffSession(req.cookies?.[STAFF_COOKIE_NAME])) {
      return res.status(409).json({
        error: 'This browser is signed in to the staff dashboard. Sign out of the admin panel to use a customer account.',
        code: 'STAFF_SESSION_ACTIVE',
      });
    }
  } catch (err) {
    console.error('Staff session check failed:', err.message);
  }

  const token = authHeader.slice('Bearer '.length).trim();

  let decodedToken;
  try {
    const auth = getFirebaseAuth();
    // checkRevoked = true: tokens from disabled accounts or after a
    // "sign out everywhere"/password change are rejected immediately.
    try {
      decodedToken = await auth.verifyIdToken(token, true);
    } catch (revocationErr) {
      // The revocation check needs a working service-account key. If that
      // key is broken (revoked / malformed in env), still accept the token
      // after a full signature check — that part only needs Google's public
      // certificates — instead of locking every customer out.
      if (!isCredentialError(revocationErr)) throw revocationErr;
      console.error('[auth] Revocation check unavailable (service-account key rejected). Falling back to signature-only verification:', revocationErr.message);
      decodedToken = await auth.verifyIdToken(token, false);
    }
  } catch (error) {
    console.error('Firebase Token Error:', error.message);
    if (
      error.message?.includes('Firebase Admin credentials are incomplete') ||
      error.message?.includes('Failed to parse private key') ||
      error.code === 'FIREBASE_UNAVAILABLE' ||
      error.code === 'app/invalid-credential'
    ) {
      return res.status(503).json({
        error: 'Authentication service is temporarily unavailable.',
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
      code: 'TOKEN_INVALID',
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

// Staff/Admin Auth Middleware — verifies the JWT from the httpOnly cookie
// only (no Authorization-header fallback, so the token can never be read or
// replayed by page scripts), loads the staff row + permissions, attaches it
// as req.staff.
export async function requireStaffAuth(req, res, next) {
  const token = req.cookies?.[STAFF_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Staff login required.' });
  }

  try {
    const staff = await resolveStaffSession(token);
    if (!staff) {
      return res.status(401).json({ error: 'Unauthorized. Invalid or expired session.' });
    }
    req.staff = staff;
    next();
  } catch (error) {
    console.error('Staff auth error:', error.message);
    return res.status(401).json({ error: 'Unauthorized. Invalid or expired session.' });
  }
}
