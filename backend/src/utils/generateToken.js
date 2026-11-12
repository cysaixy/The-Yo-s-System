// src/utils/generateToken.js
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const STAFF_TOKEN_ISSUER = 'theyos-api';
export const STAFF_TOKEN_AUDIENCE = 'theyos-staff';

// Refuse to run with a missing or trivially short secret. A silent fallback
// secret would let anyone who reads this source forge staff sessions.
let warnedShortSecret = false;
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error('JWT_SECRET is not configured.');
    err.status = 500;
    throw err;
  }
  if (secret.length < 32 && !warnedShortSecret) {
    warnedShortSecret = true;
    console.warn('[security] JWT_SECRET is shorter than 32 characters. Rotate it to a long random value.');
  }
  return secret;
}

// Short fingerprint of the current password hash. It is embedded in the
// token and re-checked on every request, so changing or resetting a password
// immediately invalidates every session issued before the change.
export function passwordFingerprint(passwordHash) {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(String(passwordHash || ''))
    .digest('base64url')
    .slice(0, 16);
}

function generateCustomerToken(customerId) {
  return jwt.sign({ customerId }, getJwtSecret(), { expiresIn: '7d', algorithm: 'HS256' });
}

function generateStaffToken(staffId, passwordHash) {
  return jwt.sign(
    { staffId, pwv: passwordFingerprint(passwordHash) },
    getJwtSecret(),
    {
      expiresIn: '12h',
      algorithm: 'HS256',
      issuer: STAFF_TOKEN_ISSUER,
      audience: STAFF_TOKEN_AUDIENCE,
    }
  );
}

export { generateCustomerToken, generateStaffToken };
