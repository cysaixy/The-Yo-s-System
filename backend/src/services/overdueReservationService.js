// src/services/overdueReservationService.js
import pool from '../config/db.js';

const OVERDUE_STATUSES = ['pending', 'confirmed'];

export async function cancelOverdueReservations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);

    const { rows: overdueReservations } = await client.query(
      `SELECT id, customer_id, reservation_date, reservation_time, status, reservation_status
       FROM reservations
       WHERE (reservation_date < $1
              OR (reservation_date = $1 AND reservation_time <= $2))
         AND status = ANY($3)
         AND (reservation_status IS NULL OR reservation_status = ANY($3))`,
      [today, currentTime, OVERDUE_STATUSES]
    );

    if (overdueReservations.length === 0) {
      await client.query('COMMIT');
      return { cancelledCount: 0, reservations: [] };
    }

    const ids = overdueReservations.map(r => r.id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');

    await client.query(
      `UPDATE reservations
       SET status = 'cancelled', reservation_status = 'cancelled'
       WHERE id IN (${placeholders})`,
      ids
    );

    await client.query('COMMIT');

    console.log(`[OverdueReservationService] Cancelled ${ids.length} overdue reservation(s):`, ids);
    return { cancelledCount: ids.length, reservations: overdueReservations };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[OverdueReservationService] Error cancelling overdue reservations:', err);
    throw err;
  } finally {
    client.release();
  }
}

export function startOverdueReservationCron(intervalMs = 15 * 60 * 1000) {
  console.log(`[OverdueReservationService] Starting cron job (interval: ${intervalMs}ms)`);
  
  const run = async () => {
    try {
      await cancelOverdueReservations();
    } catch (err) {
      console.error('[OverdueReservationService] Cron job failed:', err);
    }
  };

  run();
  return setInterval(run, intervalMs);
}