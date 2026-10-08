import express from 'express';
const staffRouter = express.Router();
import {issueCSRFToken, login, logout, me, listStaff, getStaffById, createStaff, updateStaff, updateProfile, updatePermissions, changePassword}from '../../controllers/admin/staffController.js';
import { requireStaffAuth } from '../../middlewares/auth.middleware.js';
import { csrfMiddleware } from '../../middlewares/csrf.middleware.js';
import { requireAdmin } from '../../middlewares/role.middleware.js';

// POST /api/admin/staff/login — public, no auth required yet
staffRouter.get('/csrf-token', issueCSRFToken);
staffRouter.post('/login', login);
staffRouter.post('/logout', logout);

// Everything below requires a valid staff JWT
staffRouter.use(requireStaffAuth);
staffRouter.use(csrfMiddleware);

// GET /api/admin/staff/me — any logged-in staff can see their own info
staffRouter.get('/me', me);

// PUT/PATCH /api/admin/staff/:id/profile — self-service profile update (name for all; email for Admin only)
staffRouter.put('/:id/profile', updateProfile);
staffRouter.patch('/:id/profile', updateProfile);

// Everything below is Admin-only
staffRouter.get('/', requireAdmin, listStaff);
staffRouter.get('/:id', requireAdmin, getStaffById);
staffRouter.post('/', requireAdmin, createStaff);
// staff.html and settings.html both send PUT for updates, not PATCH -
// changed to match (both routes accepted the same body shape either way).
staffRouter.put('/:id', requireAdmin, updateStaff);
staffRouter.put('/:id/permissions', requireAdmin, updatePermissions);
// PUT /api/admin/staff/:id/password — any logged-in staff can change their
// own password (settings.html); the controller verifies current password
// and restricts edits to the account owner (or an Admin).
staffRouter.put('/:id/password', changePassword);

export default staffRouter;