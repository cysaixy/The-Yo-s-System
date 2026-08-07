import express from "express";
import { posLimiter } from "../../middlewares/rateLimit.middleware.js";
import { verifyFirebaseToken } from "../../middlewares/auth.middleware.js";
import { createReservation } from "../../controllers/customer/reservation.controller.js";

const router = express.Router();

// POST /api/customer/reservations
// Was previously wide open (no auth check at all) - reservations must
// belong to a logged-in customer, same rule as orders.
router.post("/", posLimiter, verifyFirebaseToken, createReservation);

export default router;