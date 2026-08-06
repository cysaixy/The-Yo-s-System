// src/controllers/admin/reservations.controller.js
import pool from "../../config/db.js";

const VALID_STATUSES = ["pending", "confirmed", "cancelled", "completed"];

export async function listAll(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, c.name AS customer_name, r.table_no, r.reservation_date,
              r.reservation_time, r.guests, r.status, r.notes, r.datetime_reserved
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       ORDER BY r.reservation_date, r.reservation_time`
    );
    res.json({ reservations: rows });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, c.name AS customer_name FROM reservations r
       JOIN customers c ON c.id = r.customer_id WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Reservation not found." });
    res.json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    const { rows } = await pool.query(
      `UPDATE reservations SET status = $1 WHERE id = $2 RETURNING id, status`,
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Reservation not found." });
    res.json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}