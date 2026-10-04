// src/routes/customer/auth.routes.js
import express from 'express';
import { globalLimiter } from '../../middlewares/rateLimit.middleware.js';
import { verifyFirebaseToken } from '../../middlewares/auth.middleware.js';
import {
  getMe,
  syncCustomerProfile,
  updatePassword,
} from '../../controllers/customer/auth.controller.js';

const router = express.Router();

// Current authenticated customer profile (prefill forms, account gate).
router.get('/me', globalLimiter, verifyFirebaseToken, getMe);

// Customer authentication sync endpoint
router.post('/sync', globalLimiter, verifyFirebaseToken, syncCustomerProfile);

// Password update endpoint
router.post('/update-password', globalLimiter, verifyFirebaseToken, updatePassword);

export default router;