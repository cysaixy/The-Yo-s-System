import crypto from 'crypto';
import nodemailer from 'nodemailer';
import pool from '../../config/db.js';
import { getFirebaseAuth } from '../../config/firebase.js';

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhoneNumber(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 11);
}

function generateVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashCode(email, code) {
  return crypto
    .createHash('sha256')
    .update(`${email}:${code}:${process.env.OTP_PEPPER || ''}`)
    .digest('hex');
}

// Serverless instances do not share memory, so codes live in Postgres.
let otpTableReady = null;
function ensureOtpTable() {
  if (!otpTableReady) {
    otpTableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS email_otps (
          email VARCHAR(150) PRIMARY KEY,
          code_hash CHAR(64) NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .catch((err) => {
        otpTableReady = null;
        throw err;
      });
  }
  return otpTableReady;
}

async function sendOtpEmail(email, code) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || user || 'no-reply@theyos.local';

  if (!host || !user || !pass) {
    return { sent: false, code };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port || 587),
    secure: Number(port || 587) === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Your The~Yo\'s verification code',
    text: `Your verification code is ${code}. It expires in 5 minutes.`,
  });

  return { sent: true, code };
}

// Returns the currently authenticated customer profile. Called on page load
// so the frontend can prefill forms and hide/show account-gated sections.
export async function getMe(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User context missing.' });
    }

    if (req.user.customer) {
      const { rows } = await pool.query(
        `SELECT id, name, email, phone, address, firebase_uid
         FROM customers WHERE id = $1`,
        [req.user.customer.id]
      );
      if (rows[0]) {
        return res.json({ customer: rows[0] });
      }
    }

    return res.json({ customer: null });
  } catch (err) {
    next(err);
  }
}

export async function syncCustomerProfile(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User context missing.' });
    }

    const { firebaseUid, email } = req.user;
    const { name, phone, address } = req.body || {};
    const normalizedPhone = normalizePhoneNumber(phone);
    let customer = req.user.customer;

    if (customer) {
      // Existing user: Update details
      if (normalizedPhone && normalizedPhone.length !== 11) {
        return res.status(400).json({ error: 'Contact number must be exactly 11 digits.' });
      }

      const updateQuery = `
        UPDATE customers
        SET name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            address = COALESCE($3, address),
            email = COALESCE($4, email)
        WHERE firebase_uid = $5
        RETURNING id, name, email, phone, address, firebase_uid;
      `;
      const { rows } = await pool.query(updateQuery, [
        name || null,
        normalizedPhone || null,
        address || null,
        email,
        firebaseUid,
      ]);
      customer = rows[0];
    } else {
      // New user: Insert record.
      // Phone is required from this point on - it must not be possible to
      // create a customer row with phone = NULL, regardless of which auth
      // path (email/password, Google, etc.) got them here. The frontend
      // gate in account.html normally supplies this before this branch is
      // ever hit; this check exists so the rule holds even if that gate is
      // bypassed or a future auth path forgets to collect it.
      if (!normalizedPhone || normalizedPhone.length !== 11) {
        return res.status(400).json({
          error: 'A valid 11-digit contact number is required to create your account.',
          code: 'PHONE_REQUIRED',
        });
      }

      const insertQuery = `
        INSERT INTO customers (firebase_uid, email, name, phone, address)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, email, phone, address, firebase_uid;
      `;
      const { rows } = await pool.query(insertQuery, [
        firebaseUid,
        email,
        name || 'New Customer',
        normalizedPhone,
        address || null,
      ]);
      customer = rows[0];
    }

    return res.status(200).json({
      message: 'Customer profile synced successfully.',
      customer,
    });
  } catch (err) {
    next(err);
  }
}

export async function sendVerificationCode(req, res, next) {
  try {
    const { email } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    await ensureOtpTable();

    // Resend cooldown: stops someone from spamming an inbox.
    const { rows: recent } = await pool.query(
      `SELECT 1 FROM email_otps
       WHERE email = $1 AND created_at > NOW() - make_interval(secs => $2)`,
      [normalizedEmail, OTP_RESEND_COOLDOWN_SECONDS]
    );
    if (recent.length > 0) {
      return res.status(429).json({
        error: `Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
      });
    }

    const code = generateVerificationCode();
    await pool.query(
      `INSERT INTO email_otps (email, code_hash, expires_at, attempts, created_at)
       VALUES ($1, $2, NOW() + make_interval(mins => $3), 0, NOW())
       ON CONFLICT (email) DO UPDATE
         SET code_hash = EXCLUDED.code_hash,
             expires_at = EXCLUDED.expires_at,
             attempts = 0,
             created_at = NOW()`,
      [normalizedEmail, hashCode(normalizedEmail, code), OTP_TTL_MINUTES]
    );

    const delivery = await sendOtpEmail(normalizedEmail, code);

    return res.status(200).json({
      message: delivery.sent ? 'Verification code sent.' : 'Verification code generated successfully.',
      ...(process.env.NODE_ENV !== 'production' && !delivery.sent ? { debugCode: code } : {}),
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyVerificationCode(req, res, next) {
  try {
    const { email, code } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = String(code || '').trim();

    if (!normalizedEmail || !normalizedCode) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    await ensureOtpTable();

    // Count the attempt first, atomically, so parallel guesses cannot
    // sneak past the limit.
    const { rows } = await pool.query(
      `UPDATE email_otps
       SET attempts = attempts + 1
       WHERE email = $1 AND expires_at > NOW() AND attempts < $2
       RETURNING code_hash`,
      [normalizedEmail, OTP_MAX_ATTEMPTS]
    );

    const invalid = () =>
      res.status(400).json({ error: 'Invalid or expired verification code.', verified: false });

    if (!rows[0]) return invalid();

    const expected = Buffer.from(rows[0].code_hash, 'hex');
    const actual = Buffer.from(hashCode(normalizedEmail, normalizedCode), 'hex');
    const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    if (!matches) return invalid();

    await pool.query('DELETE FROM email_otps WHERE email = $1', [normalizedEmail]);
    return res.status(200).json({ verified: true, message: 'Verification code accepted.' });
  } catch (err) {
    next(err);
  }
}

// --- PASSWORD UPDATE ---
export async function updatePassword(req, res, next) {
  try {
    if (!req.user || !req.user.firebaseUid) {
      return res.status(401).json({ error: 'Unauthorized: User context missing.' });
    }

    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    await getFirebaseAuth().updateUser(req.user.firebaseUid, { password: newPassword });

    return res.status(200).json({ message: 'Password updated successfully.' });
  } catch (err) {
    // Firebase errors are operational — surface a clean message rather than
    // the raw Firebase SDK object, which can contain internal details.
    if (err.code?.startsWith('auth/')) {
      const firebaseMessages = {
        'auth/invalid-password': 'Password must be at least 6 characters.',
        'auth/user-not-found': 'User not found.',
      };
      const message = firebaseMessages[err.code] || 'Could not update password. Please try again.';
      const opErr = new Error(message);
      opErr.status = 400;
      opErr.isOperational = true;
      return next(opErr);
    }
    next(err);
  }
}