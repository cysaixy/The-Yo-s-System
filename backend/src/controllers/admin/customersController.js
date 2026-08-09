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
