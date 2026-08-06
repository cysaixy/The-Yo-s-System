// src/controllers/customer/auth.controller.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../../config/db.js";
import * as otpStore from "../../utils/otpStore.js";

export async function register(req, res, next) {
  try {
    const { name, email, phone, address, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required." });
    }

    const existingRes = await pool.query("SELECT id FROM customers WHERE email = $1", [email]);
    if (existingRes.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO customers (name, email, phone, address, password, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, name, email, phone, address, created_at`,
      [name, email, phone || null, address || null, hashedPassword]
    );

    res.status(201).json({ customer: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query("SELECT * FROM customers WHERE email = $1", [email]);
    const customer = rows[0];

    if (!customer) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(password, customer.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign({ customerId: customer.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    delete customer.password;
    res.json({ token, customer });
  } catch (err) {
    next(err);
  }
}

export async function sendOtp(req, res, next) {
  try {
    const { email } = req.body;
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }

    const code = otpStore.issueCode(email);

    // Logs the code server-side for end-to-end testing
    console.log(`[OTP] ${email} -> ${code}`);

    res.json({ message: "Verification code sent." });
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const { email, code } = req.body;
    const isValid = otpStore.verifyCode(email, code);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid or expired code." });
    }
    res.json({ verified: true });
  } catch (err) {
    next(err);
  }
}