// src/controllers/customer/reservation.controller.js
import pool from "../../config/db.js";

export async function createReservation(req, res, next) {
  try {
    const { customer_id, table_no, reservation_date, reservation_time, guests, notes } = req.body;

    if (!customer_id || !reservation_date || !reservation_time || !guests) {
      return res.status(400).json({
        error: "customer_id, reservation_date, reservation_time, and guests are required.",
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