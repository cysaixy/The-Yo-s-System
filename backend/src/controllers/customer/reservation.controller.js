// src/controllers/customer/reservation.controller.js
import pool from "../../config/db.js";

// Restaurant rules the booking form must respect (mirrored on the client).
const MAX_GUESTS = 20;
const OPENING_MINUTES = 9 * 60;   // 9:00 AM
const CLOSING_MINUTES = 21 * 60;  // 9:00 PM
const MAX_TABLE_NO_LENGTH = 50;
const MAX_NOTES_LENGTH = 500;

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
    if (!reservation_date || !reservation_time || guests === undefined || guests === null || guests === "") {
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

    // The trap: even if the client lets someone pick a fully-booked date,
    // the server refuses it. "Full" means the confirmed reservations that
    // day already occupy every seat in the room (sum of assigned table
    // capacities). Pending reservations don't hold a seat yet.
    const roomCapacity = await pool.query(
      `SELECT COALESCE(SUM(capacity), 0)::int AS seats FROM tables WHERE status = 'active'`
    );
    const seatsBooked = await pool.query(
      `SELECT COALESCE(SUM(t.capacity), 0)::int AS seats_taken
       FROM reservations r
       JOIN tables t ON t.table_no = r.table_no
       WHERE r.status = 'confirmed' AND r.reservation_date = $1`,
      [reservation_date]
    );
    if (roomCapacity.rows[0].seats > 0 && seatsBooked.rows[0].seats_taken >= roomCapacity.rows[0].seats) {
      return res.status(400).json({
        error: "Sorry — we're fully booked on that date. Please pick another day.",
      });
    }

    // Guests must be a whole number within the room's capacity.
    const guestsNum = Number(guests);
    if (!Number.isInteger(guestsNum) || guestsNum < 1 || guestsNum > MAX_GUESTS) {
      return res.status(400).json({
        error: `guests must be a whole number between 1 and ${MAX_GUESTS}.`,
      });
    }

    // Keep free-text fields short enough that nothing absurd hits Postgres.
    if (table_no && table_no.length > MAX_TABLE_NO_LENGTH) {
      return res.status(400).json({
        error: `Table preference must be ${MAX_TABLE_NO_LENGTH} characters or fewer.`,
      });
    }
    if (notes && notes.length > MAX_NOTES_LENGTH) {
      return res.status(400).json({
        error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`,
      });
    }

    // Time must be real and fall inside opening hours.
    const timeMatch = String(reservation_time).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    const timeHours = timeMatch ? Number(timeMatch[1]) : -1;
    const timeMins = timeMatch ? Number(timeMatch[2]) : -1;
    if (!timeMatch || timeHours > 23 || timeMins > 59) {
      return res.status(400).json({ error: "reservation_time must be a valid HH:MM time." });
    }
    const timeMinutes = timeHours * 60 + timeMins;
    if (timeMinutes < OPENING_MINUTES || timeMinutes > CLOSING_MINUTES) {
      return res.status(400).json({
        error: "We're open from 9:00 AM to 9:00 PM. Please pick a time within those hours.",
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO reservations (customer_id, table_no, reservation_date, reservation_time, guests, notes, status, datetime_reserved)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
       RETURNING *`,
      [customer_id, table_no || null, reservation_date, reservation_time, guestsNum, notes || null]
    );

    res.status(201).json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}

// Fully-booked dates over the next 90 days, so the booking form can grey
// them out up front. "Full" is the same rule createReservation enforces:
// confirmed reservations that day occupy every seat in the room.
export async function getAvailability(req, res, next) {
  try {
    const roomCapacity = await pool.query(
      `SELECT COALESCE(SUM(capacity), 0)::int AS seats FROM tables WHERE status = 'active'`
    );
    const totalSeats = roomCapacity.rows[0].seats;
    if (totalSeats <= 0) {
      return res.json({ room_capacity: 0, blocked_dates: [] });
    }

    const { rows } = await pool.query(
      `SELECT TO_CHAR(r.reservation_date, 'YYYY-MM-DD') AS date_str,
              SUM(t.capacity)::int AS seats_taken
       FROM reservations r
       JOIN tables t ON t.table_no = r.table_no
       WHERE r.status = 'confirmed'
         AND r.reservation_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
       GROUP BY r.reservation_date
       HAVING SUM(t.capacity) >= $1`,
      [totalSeats]
    );

    res.json({
      room_capacity: totalSeats,
      blocked_dates: rows.map((r) => r.date_str),
    });
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