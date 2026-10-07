// src/controllers/admin/reservations.controller.js
import pool from '../../config/db.js';
import { checkTimeSlotCapacity } from '../../utils/reservationCapacity.js';

const VALID_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed', 'contact_customer', 'order_preparing', 'order_finalized'];
const VALID_ORDER_STATUSES = ['no_order', 'editable', 'finalized', 'locked'];
const VALID_RESERVATION_STATUSES = ['pending', 'contact_customer', 'order_preparing', 'order_finalized', 'confirmed', 'cancelled', 'completed'];
// Two reservations on the same table can't be closer than this many
// minutes apart - the booking window covers a full seating.
const CONFLICT_WINDOW_MINUTES = 120;

export async function listAll(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, c.name AS customer_name, c.email AS customer_email,
              c.phone AS customer_phone, r.table_no, r.reservation_date,
              r.reservation_time, r.guests, r.status, r.reservation_status, r.order_status, r.notes, r.datetime_reserved
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
    if (!rows[0]) return res.status(404).json({ error: 'Reservation not found.' });
    res.json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}

// Confirm a reservation — table is assigned by staff on arrival, not at this step.
export async function confirmReservation(req, res, next) {
  try {
    const resv = await pool.query(
      'SELECT * FROM reservations WHERE id = $1',
      [req.params.id]
    );
    if (!resv.rows[0]) return res.status(404).json({ error: 'Reservation not found.' });

    const { rows } = await pool.query(
      `UPDATE reservations
       SET status = 'confirmed'
       WHERE id = $1
       RETURNING id, status, table_no`,
      [resv.rows[0].id]
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
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    const { rows } = await pool.query(
      'UPDATE reservations SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Reservation not found.' });
    res.json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function createReservationAdmin(req, res, next) {
  try {
    const { customer_id, reservation_date, reservation_time, guests, notes, status, reservation_status, order_status } = req.body;
    
    if (!customer_id || !reservation_date || !reservation_time || !guests) {
      return res.status(400).json({ error: 'customer_id, reservation_date, reservation_time, and guests are required.' });
    }

    if (order_status && !VALID_ORDER_STATUSES.includes(order_status)) {
      return res.status(400).json({ error: `order_status must be one of: ${VALID_ORDER_STATUSES.join(', ')}` });
    }

    if (reservation_status && !VALID_RESERVATION_STATUSES.includes(reservation_status)) {
      return res.status(400).json({ error: `reservation_status must be one of: ${VALID_RESERVATION_STATUSES.join(', ')}` });
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
