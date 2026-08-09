// src/routes/admin/cashAccounts.routes.js
import express from "express";
import { listAccounts, createAccount, updateAccount, deleteAccount } from "../../controllers/admin/cashAccountsController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/role.middleware.js";

const cashAccountRouter = express.Router();

cashAccountRouter.use(requireStaffAuth, requirePermission("can_access_reports"));

cashAccountRouter.get("/", listAccounts);
cashAccountRouter.post("/", createAccount);
cashAccountRouter.put("/:id", updateAccount);
cashAccountRouter.delete("/:id", deleteAccount);

export default cashAccountRouter;
