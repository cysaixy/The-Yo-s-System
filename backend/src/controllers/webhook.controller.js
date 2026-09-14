// src/controllers/webhook.controller.js
import pool from '../config/db.js';
import { verifyPaymongoSignature } from '../utils/paymongo.js';

export async function handlePaymongoWebhook(req, res) {
  const signatureHeader = req.headers['paymongo-signature'];
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

  // 1. Signature verification
  if (webhookSecret) {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const isValid = verifyPaymongoSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.warn('⚠️ [PayMongo Webhook] Invalid signature detected.');
      return res.status(400).json({ error: 'Invalid signature.' });
    }
  } else {
    console.warn('⚠️ [PayMongo Webhook] PAYMONGO_WEBHOOK_SECRET not set, skipping signature verification.');
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const event = payload?.data;
    if (!event) {
      return res.status(400).json({ error: 'Invalid payload structure.' });
    }

    const eventType = event.attributes?.type;
    const eventData = event.attributes?.data;

    console.log(`🔔 [PayMongo Webhook] Event received: ${eventType}`);

    if (eventType === 'checkout_session.payment.paid') {
      const session = eventData.attributes;
      const metadata = session.metadata || {};
      const orderId = metadata.order_id || metadata.orderId;
      const payments = session.payments || [];
      const primaryPayment = payments[0]?.attributes || {};

      const amountPaid = (primaryPayment.amount || session.line_items?.reduce((acc, item) => acc + item.amount, 0) || 0) / 100;
      const paymentMethod = primaryPayment.source?.type || 'card';
      const referenceNumber = primaryPayment.id || session.id;

      console.log(`💰 Checkout Session Paid: Order ID=${orderId}, Amount=₱${amountPaid}, Ref=${referenceNumber}`);

      if (orderId) {
        // Record payment in payments table if not already recorded
        const existingPayment = await pool.query(
          'SELECT id FROM payments WHERE reference_number = $1 LIMIT 1',
          [referenceNumber]
        );

        if (existingPayment.rows.length === 0) {
          await pool.query(
            `INSERT INTO payments (order_id, payment_method, amount, reference_number, status, datetime_paid)
             VALUES ($1, $2, $3, $4, 'paid', NOW())`,
            [orderId, paymentMethod, amountPaid, referenceNumber]
          );

          // Update order status to confirmed
          await pool.query(
            `UPDATE orders
             SET status = 'confirmed',
                 status_updated_at = NOW(),
                 payment_method = $1
             WHERE id = $2 AND status = 'pending'`,
            [paymentMethod, orderId]
          );

          console.log(`✅ Order #${orderId} marked as confirmed and paid.`);
        }
      }
    } else if (eventType === 'payment.paid') {
      const payment = eventData.attributes;
      const metadata = payment.metadata || {};
      const orderId = metadata.order_id || metadata.orderId;
      const amountPaid = payment.amount / 100;
      const paymentMethod = payment.source?.type || 'card';
      const referenceNumber = eventData.id;

      console.log(`💰 Payment Paid: Amount=₱${amountPaid}, Ref=${referenceNumber}`);

      if (orderId) {
        const existingPayment = await pool.query(
          'SELECT id FROM payments WHERE reference_number = $1 LIMIT 1',
          [referenceNumber]
        );

        if (existingPayment.rows.length === 0) {
          await pool.query(
            `INSERT INTO payments (order_id, payment_method, amount, reference_number, status, datetime_paid)
             VALUES ($1, $2, $3, $4, 'paid', NOW())`,
            [orderId, paymentMethod, amountPaid, referenceNumber]
          );

          await pool.query(
            `UPDATE orders
             SET status = 'confirmed',
                 status_updated_at = NOW(),
                 payment_method = $1
             WHERE id = $2 AND status = 'pending'`,
            [paymentMethod, orderId]
          );

          console.log(`✅ Order #${orderId} payment saved.`);
        }
      }
    } else if (eventType === 'payment.failed') {
      const payment = eventData.attributes;
      console.warn(`❌ Payment Failed for reference: ${eventData.id}`);
    }

    // Always respond with 200 OK so PayMongo acknowledges receipt
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('❌ [PayMongo Webhook] Error processing event:', err);
    // Return 500 so PayMongo retries if there is a transient DB error
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
}
