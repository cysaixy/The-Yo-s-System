// src/routes/admin/reportsRoutes.js
import express from "express";
import { summary } from "../../controllers/admin/reportsController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/role.middleware.js";

const router = express.Router();

router.use(requireStaffAuth, requirePermission("can_access_reports"));

router.get("/", summary);

export default router;
