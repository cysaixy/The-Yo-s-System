// src/routes/admin/cashTransactions.routes.js
import express from "express";
import { listTransactions, createTransaction } from "../../controllers/admin/cashTransactionsController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/role.middleware.js";

const cashTransactionRouter = express.Router();

cashTransactionRouter.use(requireStaffAuth, requirePermission("can_access_reports"));

cashTransactionRouter.get("/", listTransactions);
cashTransactionRouter.post("/", createTransaction);

export default cashTransactionRouter;
