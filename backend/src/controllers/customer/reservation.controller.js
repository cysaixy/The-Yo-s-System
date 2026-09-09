// src/controllers/customer/reservation.controller.js
import pool from "../../config/db.js";
import { checkTimeSlotCapacity, checkCustomerExistingReservation, getMaxRoomCapacity } from "../../utils/reservationCapacity.js";

// Restaurant rules the booking form must respect (mirrored on the client).
const MAX_GUESTS = 20;
const OPENING_MINUTES = 9 * 60;   // 9:00 AM
const CLOSING_MINUTES = 21 * 60;  // 9:00 PM
const MAX_NOTES_LENGTH = 500;
const MIN_ADVANCE_DAYS = 4;       // Reservations must be made at least 4 days in advance

export async function createReservation(req, res, next) {
  try {
    // Same rule as orders: customer_id comes from the verified token, never
    // from the request body.
    const customer_id = req.user?.customer?.id;
    const { reservation_date, reservation_time, guests, notes } = req.body;

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

    // Validate date format
    const [y, m, d] = String(reservation_date).split("-").map(Number);
    if (!y || !m || !d) {
      return res.status(400).json({ error: "reservation_date must be YYYY-MM-DD." });
    }
    const date = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Enforce 4-day advance booking rule (both frontend and backend)
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() + MIN_ADVANCE_DAYS);
    if (date < minDate) {
      return res.status(400).json({
        error: `Reservations must be made at least ${MIN_ADVANCE_DAYS} days in advance. Please select a later date.`,
      });
    }

    // Also reject past dates (redundant but safe)
    if (date < today) {
      return res.status(400).json({ error: "Reservation date can't be in the past." });
    }

    // Guests must be a whole number within the room's capacity.
    const guestsNum = Number(guests);
    if (!Number.isInteger(guestsNum) || guestsNum < 1 || guestsNum > MAX_GUESTS) {
      return res.status(400).json({
        error: `guests must be a whole number between 1 and ${MAX_GUESTS}.`,
      });
    }

    // Keep free-text fields short enough that nothing absurd hits Postgres.
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

    // Prevent duplicate active reservation requests by the same customer on the same date/time window
    const existing = await checkCustomerExistingReservation(customer_id, reservation_date, reservation_time);
    if (existing) {
      const existingTimeStr = String(existing.reservation_time).slice(0, 5);
      return res.status(409).json({
        error: `You already have an active reservation request on this date at ${existingTimeStr}. Please cancel your existing request if you wish to change your time.`,
      });
    }

    // Perform capacity validation based on total guest count in the overlapping time window (±2 hours, max 20 guests)
    const capacityCheck = await checkTimeSlotCapacity(reservation_date, reservation_time, guestsNum);
    if (!capacityCheck.isAvailable) {
      return res.status(409).json({
        error: `This time slot is fully booked for ${guestsNum} guest${guestsNum === 1 ? '' : 's'}. Maximum capacity per time slot is ${capacityCheck.maxCapacity} guests (${capacityCheck.occupiedGuests} reserved in this time window). Please choose another time.`,
        suggested_slots: capacityCheck.suggestedSlots,
        occupied_guests: capacityCheck.occupiedGuests,
        max_capacity: capacityCheck.maxCapacity,
      });
    }

    // Calculate order editing deadline (2 days before reservation date)
    const orderEditingDeadline = new Date(date);
    orderEditingDeadline.setDate(orderEditingDeadline.getDate() - 2);
    const deadlineStr = orderEditingDeadline.toISOString().split('T')[0];

    const { rows } = await pool.query(
      `INSERT INTO reservations (customer_id, reservation_date, reservation_time, guests, notes, status, datetime_reserved, order_status, order_editing_deadline, reservation_status)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), 'no_order', $6, 'pending')
       RETURNING *`,
      [customer_id, reservation_date, reservation_time, guestsNum, notes || null, deadlineStr]
    );

    res.status(201).json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}

// Fully-booked dates over the next 90 days, so the booking form can grey
// them out up front.
export async function getAvailability(req, res, next) {
  try {
    const maxCapacity = await getMaxRoomCapacity();
    if (maxCapacity <= 0) {
      return res.json({ room_capacity: 0, blocked_dates: [] });
    }

    const { rows } = await pool.query(
      `SELECT TO_CHAR(r.reservation_date, 'YYYY-MM-DD') AS date_str,
              SUM(r.guests)::int AS seats_taken
       FROM reservations r
       WHERE r.status NOT IN ('cancelled')
         AND (r.reservation_status IS NULL OR r.reservation_status NOT IN ('cancelled'))
         AND r.reservation_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
       GROUP BY r.reservation_date
       HAVING SUM(r.guests) >= $1`,
      [maxCapacity * 6]
    );

    res.json({
      room_capacity: maxCapacity,
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
      `SELECT id, table_no, reservation_date, reservation_time, guests, notes, status, datetime_reserved,
              order_status, order_editing_deadline, reservation_status
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
       SET status = 'cancelled', reservation_status = 'cancelled'
       WHERE id = $1 AND customer_id = $2 AND status = 'pending'
       RETURNING id, table_no, reservation_date, reservation_time, guests, notes, status, datetime_reserved,
               order_status, order_editing_deadline, reservation_status`,
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