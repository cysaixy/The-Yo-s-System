import express from 'express';
import { requireStaffAuth } from '../../middlewares/auth.middleware.js';
import { requireAdmin } from '../../middlewares/role.middleware.js';
import {
  adminListReviews,
  adminSetReviewStatus,
  adminDeleteReview,
} from '../../controllers/reviews.controller.js';

const reviewsAdminRouter = express.Router();

reviewsAdminRouter.use(requireStaffAuth);

// Any staff member can read reviews; only Admins can hide or delete them.
reviewsAdminRouter.get('/', adminListReviews);
reviewsAdminRouter.patch('/:id/status', requireAdmin, adminSetReviewStatus);
reviewsAdminRouter.delete('/:id', requireAdmin, adminDeleteReview);

export default reviewsAdminRouter;
