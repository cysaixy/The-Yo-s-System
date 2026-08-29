// src/controllers/admin/reservations.controller.js
import pool from "../../config/db.js";
import { checkTimeSlotCapacity } from "../../utils/reservationCapacity.js";

const VALID_STATUSES = ["pending", "confirmed", "cancelled", "completed", "contact_customer", "order_preparing", "order_finalized"];
const VALID_ORDER_STATUSES = ["no_order", "editable", "finalized", "locked"];
const VALID_RESERVATION_STATUSES = ["pending", "contact_customer", "order_preparing", "order_finalized", "confirmed", "cancelled", "completed"];
// Two reservations on the same table can't be closer than this many
// minutes apart - the booking window covers a full seating.
const CONFLICT_WINDOW_MINUTES = 120;

export async function listAll(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT reservations.id, customers.name AS customer_name, customers.email AS customer_email,
              customers.phone AS customer_phone, reservations.table_no, reservations.reservation_date,
              reservations.reservation_time, reservations.guests, reservations.status, reservations.reservation_status, reservations.order_status, reservations.notes, reservations.datetime_reserved
       FROM reservations
       JOIN customers ON customers.id = reservations.customer_id
       ORDER BY reservations.reservation_date, reservations.reservation_time`
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
      `SELECT reservations.*, customers.name AS customer_name FROM reservations
       JOIN customers ON customers.id = reservations.customer_id WHERE reservations.id = $1`,
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
      `SELECT reservations.id, reservations.table_no, reservations.reservation_time, reservations.guests
       FROM reservations
       WHERE reservations.table_no = $1
         AND reservations.reservation_date = $2
         AND reservations.status = 'confirmed'
         AND reservations.id <> $3
         AND ABS(EXTRACT(EPOCH FROM (reservations.reservation_time - $4::time))) / 60 < $5`,
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

export async function createReservationAdmin(req, res, next) {
  try {
    const { customer_id, reservation_date, reservation_time, guests, notes, status, reservation_status, order_status } = req.body;
    
    if (!customer_id || !reservation_date || !reservation_time || !guests) {
      return res.status(400).json({ error: "customer_id, reservation_date, reservation_time, and guests are required." });
    }

    const guestsNum = Number(guests);

    // Validate capacity for the time slot
    const capacityCheck = await checkTimeSlotCapacity(reservation_date, reservation_time, guestsNum);
    if (!capacityCheck.isAvailable) {
      return res.status(409).json({
        error: `This time slot is fully booked for ${guestsNum} guest${guestsNum === 1 ? '' : 's'}. Maximum capacity per time slot is ${capacityCheck.maxCapacity} guests (${capacityCheck.occupiedGuests} reserved in this time window). Please choose another time.`,
        suggested_slots: capacityCheck.suggestedSlots,
        occupied_guests: capacityCheck.occupiedGuests,
        max_capacity: capacityCheck.maxCapacity,
      });
    }

    // Calculate order editing deadline (2 days before reservation)
    const [y, m, d] = String(reservation_date).split('-').map(Number);
    const resDate = new Date(y, m - 1, d);
    const deadline = new Date(resDate);
    deadline.setDate(deadline.getDate() - 2);
    const deadlineStr = deadline.toISOString().split('T')[0];

    const { rows } = await pool.query(
      `INSERT INTO reservations (customer_id, reservation_date, reservation_time, guests, notes, status, datetime_reserved, order_status, order_editing_deadline, reservation_status)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)
       RETURNING *`,
      [
        customer_id, 
        reservation_date, 
        reservation_time, 
        guestsNum, 
        notes || null, 
        status || 'pending', 
        order_status || 'no_order', 
        deadlineStr, 
        reservation_status || 'pending'
      ]
    );

    res.status(201).json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}
