import express from 'express';
import { globalLimiter, otpLimiter } from '../../middlewares/rateLimit.middleware.js';
import { verifyFirebaseToken } from '../../middlewares/auth.middleware.js';
import { listPublicReviews, createReview } from '../../controllers/reviews.controller.js';

const reviewRouter = express.Router();

// GET /api/customer/reviews — public guest wall (no login needed to read)
reviewRouter.get('/', globalLimiter, listPublicReviews);

// POST /api/customer/reviews — signed-in customers; tight limiter + a
// one-review-per-day rule in the controller stop spam.
reviewRouter.post('/', otpLimiter, verifyFirebaseToken, createReview);

export default reviewRouter;
