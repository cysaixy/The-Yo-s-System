// src/utils/otpStore.js
//
// In-memory store for email verification codes used during customer
// registration. Deliberately NOT a database table - codes are short-lived
// (10 min) and disposable, so a Map is simpler and avoids a migration.
// Tradeoff you're accepting: codes are lost if the server restarts (the
// customer just has to click "Resend Code"), and this won't work correctly
// if you ever run multiple backend instances behind a load balancer
// (each instance would have its own Map). Fine for now - revisit if you
// scale past a single Node process.

const codes = new Map(); // email -> { code, expiresAt, attempts, lastSentAt }

const CODE_TTL_MS = 10 * 60 * 1000;       // code valid for 10 minutes
const RESEND_COOLDOWN_MS = 45 * 1000;      // must wait 45s between sends
const MAX_ATTEMPTS = 5;                    // wrong guesses allowed per code

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

// Returns { code } on success, or { error } if still in cooldown.
export function issueCode(email) {
  const existing = codes.get(email);
  if (existing && Date.now() - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt)) / 1000);
    return { error: `Please wait ${waitSec}s before requesting another code.` };
  }

  const code = generateCode();
  codes.set(email, {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    lastSentAt: Date.now(),
  });
  return { code };
}

// Returns { success: true } or { error }.
export function checkCode(email, submittedCode) {
  const entry = codes.get(email);
  if (!entry) return { error: "No verification code was requested for this email." };

  if (Date.now() > entry.expiresAt) {
    codes.delete(email);
    return { error: "That code expired. Please request a new one." };
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    codes.delete(email);
    return { error: "Too many incorrect attempts. Please request a new code." };
  }

  if (entry.code !== String(submittedCode).trim()) {
    return { error: "Incorrect code. Please try again." };
  }

  codes.delete(email); // one-time use
  return { success: true };
}

// Invalidates any outstanding code for an email (e.g., when sending failed),
// so the customer can immediately request a fresh one.
export function deleteCode(email) {
  codes.delete(email);
}