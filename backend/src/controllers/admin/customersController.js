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
    const { rows } = await pool.query(
      `INSERT INTO customers (name, phone, email)
       VALUES ($1, $2, $3)
       RETURNING id, name, phone, email`,
      [name, phone, email || null]
    );
    res.status(201).json({ customer: rows[0] });
  } catch (err) {
    next(err);
  }
}
