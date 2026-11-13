import express from 'express';
import { posLimiter } from '../../middlewares/rateLimit.middleware.js';
import { verifyFirebaseToken } from '../../middlewares/auth.middleware.js';
import { createReservation, getCustomerReservations, cancelReservation, getAvailability } from '../../controllers/customer/reservation.controller.js';

const reservationrouter = express.Router();

// POST /api/customer/reservations
// Was previously wide open (no auth check at all) - reservations must
// belong to a logged-in customer, same rule as orders.
reservationrouter.post('/', posLimiter, verifyFirebaseToken, createReservation);

// GET /api/customer/reservations - lets a customer check whether their
// reservation was confirmed or cancelled.
reservationrouter.get('/', verifyFirebaseToken, getCustomerReservations);

// GET /api/customer/reservations/availability - fully-booked dates, so the
// form can refuse them (server enforces the same rule on create).
reservationrouter.get('/availability', verifyFirebaseToken, getAvailability);

// PATCH /api/customer/reservations/:id/cancel - customer cancels a pending
// reservation of their own.
reservationrouter.patch('/:id/cancel', verifyFirebaseToken, cancelReservation);

export default reservationrouter;
