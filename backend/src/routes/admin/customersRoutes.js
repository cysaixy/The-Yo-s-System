// src/routes/admin/customersRoutes.js
import express from "express";
import { searchCustomers, createCustomer } from "../../controllers/admin/customersController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.use(requireStaffAuth);

router.get("/search", searchCustomers);
router.post("/", createCustomer);

export default router;
