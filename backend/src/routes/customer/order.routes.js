// src/routes/customer/order.routes.js
import express from 'express';
import { posLimiter } from '../../middlewares/rateLimit.middleware.js';
import { verifyFirebaseToken } from '../../middlewares/auth.middleware.js';
import {
  createOrder,
  getOrder,
  getCustomerOrders,
  updateOrder,
  cancelOrder,
  createPayment,
  getPayment,
  createOrderCheckoutSession,
  confirmOrderPayment,
} from '../../controllers/customer/order.controller.js';

const router = express.Router();

// Prevent rapid duplicate order submissions
router.post('/', posLimiter, verifyFirebaseToken, createOrder);

// List every order for the logged-in customer (powers "My Orders" tracking)
router.get('/', verifyFirebaseToken, getCustomerOrders);

// Fetch a single order (only if it belongs to the logged-in customer)
router.get('/:id', verifyFirebaseToken, getOrder);

// Edit checkout details while the order is still pending
router.patch('/:id', verifyFirebaseToken, updateOrder);

// Cancel an order while it is still pending
router.post('/:id/cancel', verifyFirebaseToken, cancelOrder);

router.post('/:id/payment', verifyFirebaseToken, createPayment);
router.get('/:id/payment', verifyFirebaseToken, getPayment);
router.post('/:id/checkout-session', verifyFirebaseToken, createOrderCheckoutSession);
router.post('/:id/confirm-payment', verifyFirebaseToken, confirmOrderPayment);

export default router;
