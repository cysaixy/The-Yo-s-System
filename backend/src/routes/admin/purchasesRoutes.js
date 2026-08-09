// src/routes/admin/purchases.routes.js
import express from "express";
import {list, create} from "../../controllers/admin/purchasesController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/role.middleware.js";


const purchasesrouter = express.Router();

// Apply auth and permission checks across all purchase/stock-in endpoints
purchasesrouter.use(requireStaffAuth, requirePermission("can_access_stock_in"));

purchasesrouter.get("/list", list);
purchasesrouter.post("/create", create);

export default purchasesrouter;