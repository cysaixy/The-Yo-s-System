// src/controllers/admin/reservations.controller.js
import pool from "../../config/db.js";

const VALID_STATUSES = ["pending", "confirmed", "cancelled", "completed"];
// Two reservations on the same table can't be closer than this many
// minutes apart - the booking window covers a full seating.
const CONFLICT_WINDOW_MINUTES = 120;

export async function listAll(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, c.name AS customer_name, c.email AS customer_email,
              c.phone AS customer_phone, r.table_no, r.reservation_date,
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

// Active tables only - inactive ones are off the floor and shouldn't be
// offered when confirming a reservation.
export async function listTables(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, table_no, capacity, status FROM tables
       WHERE status = 'active'
       ORDER BY capacity, table_no`
    );
    res.json({ tables: rows });
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

// The only way a reservation becomes "confirmed". Assigning a table is not
// optional - a confirmed booking must actually own a seat. Runs three
// checks before committing:
//   1. The table exists and is active.
//   2. The table seats everyone (capacity >= guests).
//   3. No other confirmed reservation holds that table at the same date
//      within the seating window.
export async function confirmReservation(req, res, next) {
  try {
    const { table_no } = req.body;
    if (!table_no) {
      return res.status(400).json({
        error: "Assign a table before confirming - a confirmed reservation needs a seat.",
      });
    }

    const tableRes = await pool.query(
      `SELECT id, table_no, capacity, status FROM tables WHERE table_no = $1`,
      [String(table_no).trim()]
    );
    if (!tableRes.rows[0]) {
      return res.status(400).json({ error: `Table "${table_no}" doesn't exist.` });
    }
    const table = tableRes.rows[0];
    if (table.status !== "active") {
      return res.status(400).json({ error: `Table ${table.table_no} is currently unavailable.` });
    }

    const resv = await pool.query(
      `SELECT * FROM reservations WHERE id = $1`,
      [req.params.id]
    );
    if (!resv.rows[0]) return res.status(404).json({ error: "Reservation not found." });
    const reservation = resv.rows[0];

    if (table.capacity < reservation.guests) {
      return res.status(400).json({
        error: `${table.table_no} seats ${table.capacity} but this reservation is for ${reservation.guests} guests. Pick a bigger table.`,
      });
    }

    const conflict = await pool.query(
      `SELECT r.id, r.table_no, r.reservation_time, r.guests
       FROM reservations r
       WHERE r.table_no = $1
         AND r.reservation_date = $2
         AND r.status = 'confirmed'
         AND r.id <> $3
         AND ABS(EXTRACT(EPOCH FROM (r.reservation_time - $4::time))) / 60 < $5`,
      [table.table_no, reservation.reservation_date, reservation.id,
       reservation.reservation_time, CONFLICT_WINDOW_MINUTES]
    );
    if (conflict.rows[0]) {
      const other = conflict.rows[0];
      return res.status(409).json({
        error: `${table.table_no} is already reserved that day at ${String(other.reservation_time).slice(0, 5)} (${other.guests} guests). Pick a different table or time.`,
      });
    }

    const { rows } = await pool.query(
      `UPDATE reservations
       SET status = 'confirmed', table_no = $1
       WHERE id = $2
       RETURNING id, status, table_no`,
      [table.table_no, reservation.id]
    );

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
    if (status === "confirmed") {
      return res.status(400).json({
        error: "Confirming requires a table assignment - use the confirm flow.",
      });
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
