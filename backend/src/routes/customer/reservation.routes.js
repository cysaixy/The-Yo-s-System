import express from "express";
import { createReservation } from "../../controllers/customer/reservation.controller.js";

const router = express.Router();

// POST /api/customer/reservations
router.post("/", createReservation);

export default router;