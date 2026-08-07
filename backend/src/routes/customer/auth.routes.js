import express from "express";
import { globalLimiter } from "../../middlewares/rateLimit.middleware.js";
import { verifyFirebaseToken } from "../../middlewares/auth.middleware.js";
import { syncCustomerProfile } from "../../controllers/customer/auth.controller.js";

const router = express.Router();

// Customer authentication sync endpoint
router.post("/sync", globalLimiter, verifyFirebaseToken, syncCustomerProfile);

export default router;