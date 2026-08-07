import express from "express";
import { summary, salesBreakdown } from "../../controllers/admin/dashboardController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
import { globalLimiter } from "../../middlewares/rateLimit.middleware.js";
//import { requirePermission } from "../../middlewares/role.middleware.js";

const dashboardRouter = express.Router();

// Protect all dashboard endpoints with rate limiting and staff auth
dashboardRouter.use(globalLimiter);
dashboardRouter.use(requireStaffAuth);

// Home page summary — default access for any staff (Cashier's default view)
dashboardRouter.get("/", summary);

// Deeper breakdown — behind can_access_reports
//dashboardRouter.get("/sales-breakdown", requirePermission("can_access_reports"), salesBreakdown);

export default dashboardRouter;