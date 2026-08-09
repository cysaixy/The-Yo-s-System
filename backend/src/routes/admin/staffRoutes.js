import express from "express";
const staffRouter = express.Router();
import {login, me, listStaff, getStaffById, createStaff, updateStaff, updatePermissions}from "../../controllers/admin/staffController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
import { requireAdmin } from "../../middlewares/role.middleware.js";

// POST /api/admin/staff/login — public, no auth required yet
staffRouter.post("/login", login);

// Everything below requires a valid staff JWT
staffRouter.use(requireStaffAuth);

// GET /api/admin/staff/me — any logged-in staff can see their own info
staffRouter.get("/me", me);

// Everything below is Admin-only
staffRouter.get("/", requireAdmin, listStaff);
staffRouter.get("/:id", requireAdmin, getStaffById);
staffRouter.post("/", requireAdmin, createStaff);
// staff.html and settings.html both send PUT for updates, not PATCH -
// changed to match (both routes accepted the same body shape either way).
staffRouter.put("/:id", requireAdmin, updateStaff);
staffRouter.put("/:id/permissions", requireAdmin, updatePermissions);

export default staffRouter;