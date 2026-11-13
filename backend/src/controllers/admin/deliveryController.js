// src/controllers/admin/deliveryController.js
// Staff side of delivery: pick a rider, send the order out, confirm hand-off.
import pool from '../../config/db.js';
import {
  ensureDeliveryColumns,
  isDeliveryOrderRow,
  deliveryCodeFor,
  codesMatch,
  MAX_CODE_ATTEMPTS,
} from '../../services/deliveryService.js';

function orderId(req) {
  const id = Number.parseInt(req.params.id, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/admin/sales/delivery/riders — any active staff can deliver
// (cashier, kitchen, manager…), so list them all.
export async function listRiders(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, role FROM staff WHERE status = 'active' ORDER BY name ASC`
    );
    res.json({ riders: rows, me: req.staff.id });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/sales/orders/:id/dispatch  { rider_id }
export async function dispatchOrder(req, res, next) {
  try {
    await ensureDeliveryColumns();
    const id = orderId(req);
    if (!id) return res.status(400).json({ error: 'Invalid order id.' });

    const riderId = Number.parseInt(req.body?.rider_id ?? req.staff.id, 10);
    const { rows: riders } = await pool.query(
      `SELECT id, name FROM staff WHERE id = $1 AND status = 'active'`,
      [riderId]
    );
    if (!riders[0]) return res.status(400).json({ error: 'Choose an active staff member to deliver this order.' });

    const { rows: found } = await pool.query(
      'SELECT id, order_type, delivery_address, status, delivery_status FROM orders WHERE id = $1',
      [id]
    );
    const order = found[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!isDeliveryOrderRow(order)) return res.status(400).json({ error: 'Only delivery orders can be sent out with a rider.' });
    if (order.status !== 'ready') return res.status(409).json({ error: 'Mark the order Ready before sending it out.' });
    if (order.delivery_status === 'delivered') return res.status(409).json({ error: 'This order was already delivered.' });

    // Re-dispatching (e.g. a different rider) also clears wrong-code attempts.
    const { rows } = await pool.query(
      `UPDATE orders
       SET delivery_status = 'out_for_delivery',
           delivery_rider_id = $2,
           delivery_dispatched_at = NOW(),
           delivery_code_attempts = 0,
           status_updated_at = NOW()
       WHERE id = $1 AND status = 'ready'
       RETURNING id, status, delivery_status, delivery_rider_id, delivery_dispatched_at`,
      [id, riderId]
    );
    if (!rows[0]) return res.status(409).json({ error: 'Order changed. Refresh and try again.' });
    res.json({ order: { ...rows[0], delivery_rider_name: riders[0].name } });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/sales/orders/:id/deliver  { code }
// The rider enters the customer's 4-digit code at the door.
export async function confirmDelivery(req, res, next) {
  const client = await pool.connect();
  try {
    await ensureDeliveryColumns();
    const id = orderId(req);
    if (!id) return res.status(400).json({ error: 'Invalid order id.' });

    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, status, datetime_ordered, delivery_status, delivery_code_attempts
       FROM orders WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const order = rows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found.' }); }
    if (order.delivery_status !== 'out_for_delivery') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: order.delivery_status === 'delivered' ? 'Already delivered.' : 'This order is not out for delivery.' });
    }
    if (order.delivery_code_attempts >= MAX_CODE_ATTEMPTS) {
      await client.query('ROLLBACK');
      return res.status(423).json({
        error: 'Too many wrong codes. Ask the customer to check My Orders, then re-send the order from the dashboard to reset.',
        code: 'CODE_LOCKED',
      });
    }

    if (!codesMatch(deliveryCodeFor(order), req.body?.code)) {
      await client.query('UPDATE orders SET delivery_code_attempts = delivery_code_attempts + 1 WHERE id = $1', [id]);
      await client.query('COMMIT');
      const left = MAX_CODE_ATTEMPTS - order.delivery_code_attempts - 1;
      return res.status(400).json({
        error: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Wrong code. Delivery confirmation is now locked.',
        attempts_left: Math.max(0, left),
      });
    }

    const { rows: done } = await client.query(
      `UPDATE orders
       SET delivery_status = 'delivered',
           delivered_at = NOW(),
           delivery_confirmed_by = 'code',
           status = CASE WHEN status = 'ready' THEN 'completed' ELSE status END,
           status_updated_at = NOW(),
           handled_by_staff_id = COALESCE(handled_by_staff_id, $2)
       WHERE id = $1
       RETURNING id, status, delivery_status, delivered_at`,
      [id, req.staff.id]
    );
    await client.query('COMMIT');
    res.json({ order: done[0], message: 'Delivered — the customer confirmed with their code.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}
