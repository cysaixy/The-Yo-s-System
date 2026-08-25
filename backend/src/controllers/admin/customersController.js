// src/controllers/admin/customersController.js
import pool from "../../config/db.js";

export async function searchCustomers(req, res, next) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ customers: [] });
    }
    const term = `%${q.trim()}%`;
    const { rows } = await pool.query(
      `SELECT id, name, email, phone
       FROM customers
       WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1
       ORDER BY name ASC
       LIMIT 15`,
      [term]
    );
    res.json({ customers: rows });
  } catch (err) {
    next(err);
  }
}

export async function createCustomer(req, res, next) {
  try {
    const { name, phone, email } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone are required." });
    }

    const cleanPhone = String(phone).trim();
    const cleanEmail = email && String(email).trim() ? String(email).trim() : null;

    // Check if customer already exists by phone or email
    const existing = await pool.query(
      `SELECT id, name, phone, email
       FROM customers
       WHERE (phone IS NOT NULL AND phone = $1)
          OR (email IS NOT NULL AND $2::text IS NOT NULL AND LOWER(email) = LOWER($2))
       LIMIT 1`,
      [cleanPhone, cleanEmail]
    );

    if (existing.rows[0]) {
      return res.status(200).json({ customer: existing.rows[0], existing: true });
    }

    // Generate non-null fallback email if none provided (since customers.email column is NOT NULL)
    const safeEmail = cleanEmail || `walkin-${cleanPhone.replace(/\D/g, '') || Date.now()}@theyos.local`;

    const { rows } = await pool.query(
      `INSERT INTO customers (name, phone, email)
       VALUES ($1, $2, $3)
       RETURNING id, name, phone, email`,
      [String(name).trim(), cleanPhone, safeEmail]
    );
    res.status(201).json({ customer: rows[0] });
  } catch (err) {
    next(err);
  }
}
