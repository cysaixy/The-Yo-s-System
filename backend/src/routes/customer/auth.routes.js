// src/routes/customer/auth.routes.js
import express from "express";
import { globalLimiter, authLimiter } from "../../middlewares/rateLimit.middleware.js";
import { verifyFirebaseToken } from "../../middlewares/auth.middleware.js";
import {
  syncCustomerProfile,
  sendVerificationCode,
  verifyEmailCode,
  updatePassword,
} from "../../controllers/customer/auth.controller.js";

const router = express.Router();

// Customer authentication sync endpoint
router.post("/sync", globalLimiter, verifyFirebaseToken, syncCustomerProfile);

// Email verification (OTP)
router.post("/send-code", authLimiter, sendVerificationCode);
router.post("/verify-code", authLimiter, verifyEmailCode);

// Password update endpoint
router.post("/update-password", globalLimiter, verifyFirebaseToken, updatePassword);

export default router;