// src/routes/customer/auth.routes.js
import express from "express";
import { globalLimiter, otpLimiter } from "../../middlewares/rateLimit.middleware.js";
import { verifyFirebaseToken } from "../../middlewares/auth.middleware.js";
import {
  getMe,
  syncCustomerProfile,
  sendVerificationCode,
  verifyEmailCode,
  updatePassword,
} from "../../controllers/customer/auth.controller.js";

const router = express.Router();

// Current authenticated customer profile (prefill forms, account gate).
router.get("/me", globalLimiter, verifyFirebaseToken, getMe);

// Customer authentication sync endpoint
router.post("/sync", globalLimiter, verifyFirebaseToken, syncCustomerProfile);

// Email verification (OTP)
router.post("/send-code", otpLimiter, sendVerificationCode);
router.post("/verify-code", otpLimiter, verifyEmailCode);

// Password update endpoint
router.post("/update-password", globalLimiter, verifyFirebaseToken, updatePassword);

export default router;