// src/routes/customer/auth.routes.js
// Note: every /api route already passes through globalLimiter in app.js.
import express from 'express';
import { otpLimiter, otpVerifyLimiter } from '../../middlewares/rateLimit.middleware.js';
import { verifyFirebaseToken } from '../../middlewares/auth.middleware.js';
import {
  getMe,
  syncCustomerProfile,
  sendVerificationCode,
  verifyVerificationCode,
  updatePassword,
} from '../../controllers/customer/auth.controller.js';

const router = express.Router();

// Current authenticated customer profile (prefill forms, account gate).
router.get('/me', verifyFirebaseToken, getMe);

// Customer authentication sync endpoint
router.post('/sync', verifyFirebaseToken, syncCustomerProfile);

// Email verification flow used by account creation and password change screens
router.post('/send-code', otpLimiter, sendVerificationCode);
router.post('/verify-code', otpVerifyLimiter, verifyVerificationCode);

// Password update — protected by a fresh, single-use email-code grant
// (see updatePassword), so it doesn't need its own rate limit.
router.post('/update-password', verifyFirebaseToken, updatePassword);

export default router;
