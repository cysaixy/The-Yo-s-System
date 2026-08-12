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

    // Reject past dates server-side too - the picker guards the frontend, but
    // the API must not trust the client.
    const [y, m, d] = String(reservation_date).split("-").map(Number);
    if (!y || !m || !d) {
      return res.status(400).json({ error: "reservation_date must be YYYY-MM-DD." });
    }
    const date = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      return res.status(400).json({ error: "Reservation date can't be in the past." });
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

// Lets a customer cancel their own reservation while it's still pending.
// Already-confirmed or already-cancelled reservations can't be cancelled
// from the customer side.
export async function cancelReservation(req, res, next) {
  try {
    const customer_id = req.user?.customer?.id;
    const { id } = req.params;

    const { rows } = await pool.query(
      `UPDATE reservations
       SET status = 'cancelled'
       WHERE id = $1 AND customer_id = $2 AND status = 'pending'
       RETURNING id, table_no, reservation_date, reservation_time, guests, notes, status, datetime_reserved`,
      [id, customer_id]
    );

    if (!rows[0]) {
      // Distinguish "not found / not yours" from "already decided".
      const check = await pool.query(
        `SELECT status FROM reservations WHERE id = $1 AND customer_id = $2`,
        [id, customer_id]
      );
      if (!check.rows[0]) {
        return res.status(404).json({ error: "Reservation not found." });
      }
      return res.status(409).json({
        error: `This reservation can't be cancelled because it was already ${check.rows[0].status}.`,
      });
    }

    res.json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}