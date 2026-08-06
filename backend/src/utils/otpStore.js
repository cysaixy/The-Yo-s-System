// src/utils/otpStore.js
//
// Minimal in-memory OTP store to replace the fake hardcoded "5821" token
// in order.html. Good enough for a single-server deployment; if you ever
// run multiple backend instances, swap this Map for Redis so all
// instances share the same codes.

const codes = new Map(); // email -> { code, expiresAt }
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function issueCode(email) {
  const code = generateCode();
  codes.set(email, { code, expiresAt: Date.now() + OTP_TTL_MS });
  return code;
}

function verifyCode(email, submittedCode) {
  const entry = codes.get(email);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    codes.delete(email);
    return false;
  }
  const isValid = entry.code === submittedCode;
  if (isValid) codes.delete(email); // one-time use
  return isValid;
}

export { issueCode, verifyCode };
