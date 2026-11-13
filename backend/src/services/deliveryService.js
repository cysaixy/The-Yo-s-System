// src/services/deliveryService.js
//
// Delivery hand-off for orders that leave the restaurant.
//
//   ready  ──dispatch(rider)──▶  out_for_delivery  ──code / customer──▶  delivered (order completed)
//
// Proof of delivery: every delivery order has a 4-digit code that only the
// customer sees (My Orders). The rider types it in at the door; only the
// right code completes the order. The code is NOT stored — it is derived
// from the order with a server secret, so it never appears in admin data.
import crypto from 'crypto';
import pool from '../config/db.js';
import { getJwtSecret } from '../utils/generateToken.js';

export const MAX_CODE_ATTEMPTS = 5;

let columnsReady = null;
export function ensureDeliveryColumns() {
  if (!columnsReady) {
    columnsReady = pool.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_rider_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_dispatched_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_confirmed_by VARCHAR(20);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_code_attempts INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS orders_delivery_status_idx ON orders(delivery_status);
    `).catch(err => { columnsReady = null; throw err; });
  }
  return columnsReady;
}

// Delivery orders are stored as 'delivery' (older rows may say 'online').
export function isDeliveryOrderRow(order) {
  const type = String(order?.order_type || '').toLowerCase();
  return type === 'delivery' || (type === 'online' && Boolean(order?.delivery_address));
}

// 4-digit code from HMAC(secret, order id + time placed). Stable for the
// order's life, impossible to guess from the order number alone.
export function deliveryCodeFor(order) {
  const placed = order?.datetime_ordered ? new Date(order.datetime_ordered).toISOString() : '';
  const digest = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`delivery:${order.id}:${placed}`)
    .digest();
  return String(digest.readUInt32BE(0) % 10000).padStart(4, '0');
}

export function codesMatch(expected, provided) {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(provided ?? '').replace(/\D/g, '').slice(0, 4).padStart(4, 'x'));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
