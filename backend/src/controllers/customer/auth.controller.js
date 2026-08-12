// src/controllers/customer/auth.controller.js
import pool from "../../config/db.js";
import { issueCode, checkCode, deleteCode } from "../../utils/otpStore.js";
import { sendOtpEmail } from "../../utils/email.util.js";
import { auth } from "../../config/firebase.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns the currently authenticated customer profile. Called on page load
// so the frontend can prefill forms and hide/show account-gated sections.
export async function getMe(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized: User context missing." });
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
  } catch (error) {
    console.error("getMe error:", error);
    return res.status(500).json({ error: "Couldn't load profile." });
  }
}

export async function syncCustomerProfile(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized: User context missing." });
    }

    const { firebaseUid, email } = req.user;
    const { name, phone, address } = req.body || {};
    let customer = req.user.customer;

    if (customer) {
      // Existing user: Update details
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
        phone || null,
        address || null,
        email,
        firebaseUid,
      ]);
      customer = rows[0];
    } else {
      // New user: Insert record
      const insertQuery = `
        INSERT INTO customers (firebase_uid, email, name, phone, address)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, email, phone, address, firebase_uid;
      `;
      const { rows } = await pool.query(insertQuery, [
        firebaseUid,
        email,
        name || "New Customer",
        phone || null,
        address || null,
      ]);
      customer = rows[0];
    }

    return res.status(200).json({
      message: "Customer profile synced successfully.",
      customer,
    });
  } catch (error) {
    console.error("Sync Profile Error:", error);
    return res.status(500).json({
      error: "Internal server error during sync.",
      details: error.message
    });
  }
}

// --- EMAIL VERIFICATION (OTP) FOR REGISTRATION & SECURITY ---
export async function sendVerificationCode(req, res) {
  const { email } = req.body || {};
  try {
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }

    const result = issueCode(email);
    if (result.error) {
      return res.status(429).json({ error: result.error });
    }

    await sendOtpEmail(email, result.code);

    return res.status(200).json({ message: "Verification code sent." });
  } catch (error) {
    console.error("sendVerificationCode error:", error);
    if (email) deleteCode(email); // failed send -> allow immediate retry
    if (error && (error.responseCode === 535 || error.code === "EAUTH")) {
      return res.status(502).json({
        error: "Couldn't send the verification email. The email service rejected the SMTP credentials - check SMTP_USER and SMTP_PASS in backend/.env.",
      });
    }
    return res.status(500).json({ error: "Couldn't send verification email. Please try again." });
  }
}

export async function verifyEmailCode(req, res) {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are both required." });
    }

    const result = checkCode(email, code);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({ verified: true });
  } catch (error) {
    console.error("verifyEmailCode error:", error);
    return res.status(500).json({ error: "Couldn't verify code. Please try again." });
  }
}

// --- PASSWORD UPDATE (POST-OTP) ---
export async function updatePassword(req, res) {
  try {
    if (!req.user || !req.user.firebaseUid) {
      return res.status(401).json({ error: "Unauthorized: User context missing." });
    }

    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters long." });
    }

    await auth.updateUser(req.user.firebaseUid, { password: newPassword });

    return res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("updatePassword error:", error);
    return res.status(500).json({ error: "Couldn't update password. Please try again." });
  }
}