import express from "express";
const salesRouter = express.Router();
import {
  createPosOrder,
  getOrder,
  updateOrderStatus,
  updateDeliveryFee,
  listOrders,
  listPayments,
  updatePaymentStatus,
  salesReport,
  salesSummary,
  dailySales,
  topAddonsReport,
  productSalesReport,
  categorySalesReport,
  orderTypesReport,
} from "../../controllers/admin/salesController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/role.middleware.js";

salesRouter.use(requireStaffAuth);

// POS order creation — any active staff (Cashier's default access per the ERD legend)
salesRouter.post("/pos/orders", createPosOrder);
salesRouter.get("/pos/orders/:id", getOrder);
salesRouter.patch("/pos/orders/:id/status", updateOrderStatus);

// Viewing/confirming orders (including customer online orders) — also
// default Cashier access per the ERD legend ("Online Orders" is listed
// alongside Dashboard/POS/Reservations, not behind a report permission).
salesRouter.get("/orders", listOrders);
salesRouter.get("/orders/:id", getOrder);
// Assigning/editing the delivery fee is order management, same default
// Cashier access as viewing and confirming orders above — not gated
// behind can_access_reports.
salesRouter.patch("/orders/:id/delivery-fee", updateDeliveryFee);

// Payments and sales reports — genuinely behind can_access_reports
salesRouter.get("/payments", requirePermission("can_access_reports"), listPayments);
salesRouter.patch("/payments/:id/status", requirePermission("can_access_reports"), updatePaymentStatus);
salesRouter.get("/report", requirePermission("can_access_reports"), salesReport);
salesRouter.get("/summary", requirePermission("can_access_reports"), salesSummary);
salesRouter.get("/daily", requirePermission("can_access_reports"), dailySales);
salesRouter.get("/report/top-addons", requirePermission("can_access_reports"), topAddonsReport);
salesRouter.get("/report/products", requirePermission("can_access_reports"), productSalesReport);
salesRouter.get("/report/categories", requirePermission("can_access_reports"), categorySalesReport);
salesRouter.get("/report/order-types", requirePermission("can_access_reports"), orderTypesReport);

export default salesRouter;