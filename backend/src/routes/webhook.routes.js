// src/routes/webhook.routes.js
import express from 'express';
import { handlePaymongoWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

// POST /api/webhooks/paymongo
router.post('/paymongo', handlePaymongoWebhook);

export default router;
