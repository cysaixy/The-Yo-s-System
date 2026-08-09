// src/controllers/customer/reservation.controller.js
import pool from "../../config/db.js";

export async function createReservation(req, res, next) {
  try {
    // Same rule as orders: customer_id comes from the verified token, never
    // from the request body.
    const customer_id = req.user?.customer?.id;
    const { table_no, reservation_date, reservation_time, guests, notes } = req.body;

    if (!customer_id) {
      return res.status(400).json({
        error: "No customer profile found for this account. Call /api/customer/auth/sync first.",
      });
    }
    if (!reservation_date || !reservation_time || !guests) {
      return res.status(400).json({
        error: "reservation_date, reservation_time, and guests are required.",
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO reservations (customer_id, table_no, reservation_date, reservation_time, guests, notes, status, datetime_reserved)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
       RETURNING *`,
      [customer_id, table_no || null, reservation_date, reservation_time, guests, notes || null]
    );

    res.status(201).json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}

// Lists every reservation made by the currently authenticated customer, so
// they can check whether the restaurant confirmed or cancelled it - powers
// the status list on reservations.html.
export async function getCustomerReservations(req, res, next) {
  try {
    const customer_id = req.user?.customer?.id;
    if (!customer_id) {
      return res.status(400).json({
        error: "No customer profile found for this account. Call /api/customer/auth/sync first.",
      });
    }

    const { rows } = await pool.query(
      `SELECT id, table_no, reservation_date, reservation_time, guests, notes, status, datetime_reserved
       FROM reservations
       WHERE customer_id = $1
       ORDER BY reservation_date DESC, reservation_time DESC`,
      [customer_id]
    );

    res.json({ reservations: rows });
  } catch (err) {
    next(err);
  }
}