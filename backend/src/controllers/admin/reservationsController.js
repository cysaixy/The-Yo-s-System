// src/controllers/admin/reservations.controller.js
import pool from '../../config/db.js';
import { checkTimeSlotCapacity } from '../../utils/reservationCapacity.js';
import { postOrderPayment, reverseCashOrderSale } from '../../services/cashReconciliationService.js';
import { restoreOrderInventory } from '../../utils/inventoryRestore.js';

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
  const client = await pool.connect();
  try {
    const { status, payment_method, amount_received, reference_number } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      client.release();
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    await client.query('BEGIN');

    const resvResult = await client.query(
      'SELECT * FROM reservations WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );

    if (!resvResult.rows[0]) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    const reservation = resvResult.rows[0];
    let updatedOrder = null;
    let paymentRecord = null;
    let cashTx = null;

    if (status === 'completed') {
      const { rows: orderRows } = await client.query(
        'SELECT * FROM orders WHERE reservation_id = $1 FOR UPDATE',
        [reservation.id]
      );

      if (orderRows[0]) {
        const order = orderRows[0];
        const payMethod = String(payment_method || order.payment_method || 'cash').toLowerCase();
        const totalAmount = Number(order.total_amount) || 0;

        // Check if payment already recorded
        const { rows: existingPayments } = await client.query(
          'SELECT * FROM payments WHERE order_id = $1',
          [order.id]
        );

        if (totalAmount > 0 && existingPayments.length === 0) {
          const { rows: pRows } = await client.query(
            `INSERT INTO payments (order_id, payment_method, amount, status, datetime_paid, reference_number)
             VALUES ($1, $2, $3, 'paid', NOW(), $4)
             RETURNING *`,
            [order.id, payMethod, totalAmount, reference_number || null]
          );
          paymentRecord = pRows[0];

          // Post to cash_transactions and credit account
          try {
            cashTx = await postOrderPayment(client, {
              orderId: order.id,
              paymentMethod: payMethod,
              amount: totalAmount,
              staffId: req.staff?.id || null,
              description: `Reservation #${reservation.id} dining payment (${payMethod.toUpperCase()})`,
            });
          } catch (postErr) {
            console.warn(`[updateStatus] Could not post cash transaction for completed reservation #${reservation.id}:`, postErr.message);
          }
        }

        // Update order status to completed
        await client.query('SAVEPOINT before_order_complete');
        try {
          const { rows: ordUpd } = await client.query(
            `UPDATE orders
             SET status = 'completed',
                 payment_method = $1,
                 status_updated_at = NOW(),
                 handled_by_staff_id = COALESCE(handled_by_staff_id, $2)
             WHERE id = $3
             RETURNING *`,
            [payMethod, req.staff?.id || null, order.id]
          );
          updatedOrder = ordUpd[0];
          await client.query('RELEASE SAVEPOINT before_order_complete');
        } catch {
          await client.query('ROLLBACK TO SAVEPOINT before_order_complete');
          const { rows: ordUpd } = await client.query(
            `UPDATE orders
             SET status = 'completed',
                 payment_method = $1
             WHERE id = $2
             RETURNING *`,
            [payMethod, order.id]
          );
          updatedOrder = ordUpd[0];
        }
      }
    } else if (status === 'cancelled') {
      // Find all active uncompleted orders linked to this reservation
      const { rows: ordersToCancel } = await client.query(
        `SELECT id FROM orders
         WHERE reservation_id = $1 AND status NOT IN ('completed', 'cancelled')
         FOR UPDATE`,
        [reservation.id]
      );
      for (const order of ordersToCancel) {
        await client.query('SAVEPOINT before_order_cancel');
        try {
          await client.query(
            'UPDATE orders SET status = \'cancelled\', status_updated_at = NOW() WHERE id = $1',
            [order.id]
          );
          await client.query('RELEASE SAVEPOINT before_order_cancel');
        } catch {
          await client.query('ROLLBACK TO SAVEPOINT before_order_cancel');
          await client.query(
            'UPDATE orders SET status = \'cancelled\' WHERE id = $1',
            [order.id]
          );
        }

        try {
          await restoreOrderInventory(client, order.id, req.staff?.id || null);
        } catch (invErr) {
          console.warn(`[updateStatus] Could not restore inventory for order #${order.id}:`, invErr.message);
        }

        try {
          await reverseCashOrderSale(client, {
            orderId: order.id,
            staffId: req.staff?.id || null,
          });
        } catch (cashErr) {
          console.warn(`[updateStatus] Could not reverse cash sale for order #${order.id}:`, cashErr.message);
        }
      }
    }

    const { rows: finalResv } = await client.query(
      `UPDATE reservations
       SET status = $1,
           reservation_status = CASE
             WHEN $1 = 'completed' THEN 'completed'
             WHEN $1 = 'cancelled' THEN 'cancelled'
             ELSE reservation_status
           END
       WHERE id = $2
       RETURNING *`,
      [status, reservation.id]
    );

    await client.query('COMMIT');
    client.release();

    res.json({
      reservation: finalResv[0],
      order: updatedOrder,
      payment: paymentRecord,
      cash_transaction: cashTx,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
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
    const dlY = deadline.getFullYear();
    const dlM = String(deadline.getMonth() + 1).padStart(2, '0');
    const dlD = String(deadline.getDate()).padStart(2, '0');
    const deadlineStr = `${dlY}-${dlM}-${dlD}`;

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
