// src/routes/customer/order.routes.js
import express from "express";
import { posLimiter, globalLimiter } from "../../middlewares/rateLimit.middleware.js";
import { verifyFirebaseToken } from "../../middlewares/auth.middleware.js";
import {
  createOrder,
  getOrder,
  getCustomerOrders,
  updateOrder,
  cancelOrder,
  createPayment,
  getPayment,
} from "../../controllers/customer/order.controller.js";

const router = express.Router();

// Prevent rapid duplicate order submissions
router.post("/", posLimiter, verifyFirebaseToken, createOrder);

// List every order for the logged-in customer (powers "My Orders" tracking)
router.get("/", globalLimiter, verifyFirebaseToken, getCustomerOrders);

// Fetch a single order (only if it belongs to the logged-in customer)
router.get("/:id", globalLimiter, verifyFirebaseToken, getOrder);

// Edit checkout details while the order is still pending
router.patch("/:id", globalLimiter, verifyFirebaseToken, updateOrder);

// Cancel an order while it is still pending
router.post("/:id/cancel", globalLimiter, verifyFirebaseToken, cancelOrder);

router.post("/:id/payment", globalLimiter, verifyFirebaseToken, createPayment);
router.get("/:id/payment", globalLimiter, verifyFirebaseToken, getPayment);

export default router;
