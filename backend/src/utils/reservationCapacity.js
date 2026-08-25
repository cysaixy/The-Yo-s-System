// src/utils/reservationCapacity.js
import pool from "../config/db.js";

export const CONFLICT_WINDOW_MINUTES = 120; // ±2 hours seating window
export const OPENING_MINUTES = 9 * 60;      // 9:00 AM (540 mins)
export const CLOSING_MINUTES = 21 * 60;     // 9:00 PM (1260 mins)
export const MAX_CAPACITY_PER_SLOT = 20;    // 20 guests max per time slot window

/**
 * Gets the maximum room guest capacity per time slot (20 guests max per slot).
 */
export async function getMaxRoomCapacity() {
  return MAX_CAPACITY_PER_SLOT;
}

/**
 * Checks if a specific customer already has an active reservation in the overlapping time window.
 */
export async function checkCustomerExistingReservation(customerId, reservationDate, reservationTime, excludeId = null) {
  if (!customerId) return null;

  const { rows } = await pool.query(
    `SELECT id, reservation_time, status, reservation_status
     FROM reservations
     WHERE customer_id = $1
       AND reservation_date = $2
       AND status NOT IN ('cancelled')
       AND (reservation_status IS NULL OR reservation_status NOT IN ('cancelled'))
       AND ABS(EXTRACT(EPOCH FROM (reservation_time - $3::time))) / 60 < $4
       AND ($5::int IS NULL OR id <> $5::int)
     ORDER BY reservation_time
     LIMIT 1`,
    [customerId, reservationDate, reservationTime, CONFLICT_WINDOW_MINUTES, excludeId]
  );

  return rows[0] || null;
}

/**
 * Checks guest capacity for a given date, time, and requested guest count.
 * Sums up guests from all active non-cancelled reservations in the overlapping time window (±120 min).
 * If over capacity, returns nearby suggested time slots within operating hours.
 */
export async function checkTimeSlotCapacity(reservationDate, reservationTime, requestedGuests, excludeId = null) {
  const maxCapacity = MAX_CAPACITY_PER_SLOT;

  // Query sum of guests in overlapping time window (within CONFLICT_WINDOW_MINUTES)
  const sumQuery = await pool.query(
    `SELECT COALESCE(SUM(guests), 0)::int AS total_guests
     FROM reservations
     WHERE reservation_date = $1
       AND status NOT IN ('cancelled')
       AND (reservation_status IS NULL OR reservation_status NOT IN ('cancelled'))
       AND ABS(EXTRACT(EPOCH FROM (reservation_time - $2::time))) / 60 < $3
       AND ($4::int IS NULL OR id <> $4::int)`,
    [reservationDate, reservationTime, CONFLICT_WINDOW_MINUTES, excludeId]
  );

  const occupiedGuests = sumQuery.rows[0]?.total_guests || 0;
  const availableCapacity = Math.max(0, maxCapacity - occupiedGuests);
  const isAvailable = occupiedGuests + requestedGuests <= maxCapacity;

  if (isAvailable) {
    return {
      isAvailable: true,
      occupiedGuests,
      maxCapacity,
      availableCapacity,
      suggestedSlots: [],
    };
  }

  // Generate candidate time slots within operating hours (every 1 hour from 9:00 to 21:00)
  const [reqH, reqM] = String(reservationTime).split(":").map(Number);
  const reqTotalMinutes = (isNaN(reqH) ? 12 : reqH) * 60 + (isNaN(reqM) ? 0 : reqM);

  const candidateSlots = [];
  const reqTimeFormatted = `${String(reqH || 0).padStart(2, "0")}:${String(reqM || 0).padStart(2, "0")}`;

  for (let mins = OPENING_MINUTES; mins <= CLOSING_MINUTES; mins += 60) {
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    const candidateTime = `${hh}:${mm}`;

    if (candidateTime === reqTimeFormatted) continue;

    const candQuery = await pool.query(
      `SELECT COALESCE(SUM(guests), 0)::int AS total_guests
       FROM reservations
       WHERE reservation_date = $1
         AND status NOT IN ('cancelled')
         AND (reservation_status IS NULL OR reservation_status NOT IN ('cancelled'))
         AND ABS(EXTRACT(EPOCH FROM (reservation_time - $2::time))) / 60 < $3
         AND ($4::int IS NULL OR id <> $4::int)`,
      [reservationDate, candidateTime, CONFLICT_WINDOW_MINUTES, excludeId]
    );

    const candOccupied = candQuery.rows[0]?.total_guests || 0;
    if (candOccupied + requestedGuests <= maxCapacity) {
      const diff = Math.abs(mins - reqTotalMinutes);
      candidateSlots.push({ time: candidateTime, diff, availableCapacity: maxCapacity - candOccupied });
    }
  }

  // Sort by closest to requested time
  candidateSlots.sort((a, b) => a.diff - b.diff);
  const suggestedSlots = candidateSlots.slice(0, 4).map((s) => s.time);

  return {
    isAvailable: false,
    occupiedGuests,
    maxCapacity,
    availableCapacity,
    suggestedSlots,
  };
}
