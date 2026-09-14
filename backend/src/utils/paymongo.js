// src/utils/paymongo.js
import crypto from 'crypto';

/**
 * Verifies the PayMongo webhook signature.
 * 
 * PayMongo headers format:
 * paymongo-signature: t=<timestamp>,te=<test_signature>,li=<live_signature>
 * 
 * Signature is computed as:
 * HMAC-SHA256(timestamp + "." + rawBody, webhookSecret)
 */
export function verifyPaymongoSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret || !rawBody) {
    return false;
  }

  try {
    const parts = signatureHeader.split(',');
    let timestamp = null;
    let signature = null;

    for (const part of parts) {
      const [key, value] = part.trim().split('=');
      if (key === 't') timestamp = value;
      if (key === 'te' || key === 'li') signature = value; // te = test, li = live
    }

    if (!timestamp || !signature) {
      return false;
    }

    const payloadToSign = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadToSign)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (err) {
    console.error('Error verifying PayMongo signature:', err.message);
    return false;
  }
}

/**
 * Helper to call PayMongo API
 */
export async function paymongoFetch(endpoint, options = {}) {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    throw new Error('PAYMONGO_SECRET_KEY is not configured in .env');
  }

  const encodedAuth = Buffer.from(`${secretKey}:`).toString('base64');

  const response = await fetch(`https://api.paymongo.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${encodedAuth}`,
      ...(options.headers || {}),
    },
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data?.errors?.[0]?.detail || response.statusText;
    throw new Error(`PayMongo API Error: ${errorMsg}`);
  }

  return data;
}

/**
 * Creates a PayMongo Checkout Session for customer orders
 */
export async function createPaymongoCheckoutSession({
  orderId,
  amount,
  description,
  successUrl,
  cancelUrl,
  customerEmail,
  customerName,
  customerPhone,
}) {
  const centavos = Math.round(Number(amount) * 100);

  const payload = {
    data: {
      attributes: {
        send_email_receipt: Boolean(customerEmail),
        show_description: true,
        show_line_items: true,
        line_items: [
          {
            currency: 'PHP',
            amount: centavos,
            name: description || `Order #${orderId}`,
            quantity: 1,
          },
        ],
        payment_method_types: ['gcash', 'paymaya', 'card', 'qrph'],
        description: description || `The Yo's - Order #${orderId}`,
        metadata: {
          order_id: String(orderId),
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
    },
  };

  const response = await paymongoFetch('/checkout_sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response?.data?.attributes?.checkout_url || null;
}

