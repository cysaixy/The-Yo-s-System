import express from "express";
const salesRouter = express.Router();
import {createPosOrder, getOrder, updateOrderStatus, listOrders, listPayments,updatePaymentStatus, salesReport} from "../../controllers/admin/salesController.js";
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

// Payments and sales reports — genuinely behind can_access_reports
salesRouter.get("/payments", requirePermission("can_access_reports"), listPayments);
salesRouter.patch("/payments/:id/status", requirePermission("can_access_reports"), updatePaymentStatus);
salesRouter.get("/report", requirePermission("can_access_reports"), salesReport);

export default salesRouter;
