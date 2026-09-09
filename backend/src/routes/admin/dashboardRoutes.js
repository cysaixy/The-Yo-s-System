import express from "express";
import {
  summary,
  salesBreakdown,
  monthlyTarget,
  setMonthlyTarget,
  bestSellers,
  salesTrend,
  cashOverview,
  cashTrend,
  inventoryOverview,
  inventoryUsage,
  inventoryStatus,
} from "../../controllers/admin/dashboardController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
import { globalLimiter } from "../../middlewares/rateLimit.middleware.js";
import { requirePermission, requireAdmin } from "../../middlewares/role.middleware.js";

const dashboardRouter = express.Router();

// Protect all dashboard endpoints with rate limiting and staff auth
dashboardRouter.use(globalLimiter);
dashboardRouter.use(requireStaffAuth);

// Home page summary — default access for any staff (Cashier's default view)
dashboardRouter.get("/", summary);
// dashboard.html calls /api/admin/dashboard/summary specifically - added
// as an explicit alias so that request stops 404ing.
dashboardRouter.get("/summary", summary);

// --- Sales sections (behind can_access_reports) ---
dashboardRouter.get("/sales-breakdown", requirePermission("can_access_reports"), salesBreakdown);
dashboardRouter.get("/best-sellers", requirePermission("can_access_reports"), bestSellers);
dashboardRouter.get("/sales-trend", requirePermission("can_access_reports"), salesTrend);
dashboardRouter.get("/monthly-target", requirePermission("can_access_reports"), monthlyTarget);
// Changing the target is a business-setting change - Admin only.
dashboardRouter.put("/monthly-target", requireAdmin, setMonthlyTarget);

// --- Cash sections (behind can_access_reports) ---
dashboardRouter.get("/cash-overview", requirePermission("can_access_reports"), cashOverview);
dashboardRouter.get("/cash-trend", requirePermission("can_access_reports"), cashTrend);

// --- Inventory sections ---
// Counts are part of the default dashboard view (mirrors the old
// "Low / Out of Stock" card), but the detailed usage + status tables are
// gated the same way the Inventory nav item is.
dashboardRouter.get("/inventory-overview", inventoryOverview);
dashboardRouter.get("/inventory-usage", requirePermission("can_access_inventory"), inventoryUsage);
dashboardRouter.get("/inventory-status", requirePermission("can_access_inventory"), inventoryStatus);

export default dashboardRouter;
