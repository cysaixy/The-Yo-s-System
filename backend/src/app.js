// src/app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import errorHandler from "./middlewares/error.middleware.js";
import { globalLimiter, authLimiter } from "./middlewares/rateLimit.middleware.js";

// Customer routes
import customerMenuRoutes from "./routes/customer/menu.routes.js";
import customerAuthRoutes from "./routes/customer/auth.routes.js";
import customerOrderRoutes from "./routes/customer/order.routes.js";
import customerReservationRoutes from "./routes/customer/reservation.routes.js";

// Admin routes
import adminStaffRoutes from "./routes/admin/staffRoutes.js";
import adminProductsRoutes from "./routes/admin/productsRoutes.js";
import adminInventoryRoutes from "./routes/admin/inventoryRoutes.js";
import adminPurchasesRoutes from "./routes/admin/purchasesRoutes.js";
import adminSalesRoutes from "./routes/admin/salesRoutes.js";
import adminReservationsRoutes from "./routes/admin/reservationsRoutes.js";
import adminDashboardRoutes from "./routes/admin/dashboardRoutes.js";
import adminBudgetRoutes from "./routes/admin/budgetRoutes.js";
import adminCashAccountsRoutes from "./routes/admin/cashAccountsRoutes.js";
import adminCashTransactionsRoutes from "./routes/admin/cashTransactionsRoutes.js";
import adminReportsRoutes from "./routes/admin/reportsRoutes.js";
import adminCustomersRoutes from "./routes/admin/customersRoutes.js";

const app = express();

// Trust reverse proxy headers (e.g., Nginx, Render, Railway, AWS ALB, Vercel)
// Required for express-rate-limit to correctly identify client IP addresses
app.set("trust proxy", 1);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

// Apply global rate limiting across all API endpoints
app.use("/api", globalLimiter);

// Health check - confirms the server + env vars are working
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// --- Customer API ---
app.use("/api/customer/menu", customerMenuRoutes);
app.use("/api/customer/auth", customerAuthRoutes);
app.use("/api/customer/orders", customerOrderRoutes);
app.use("/api/customer/reservations", customerReservationRoutes);

// --- Admin API ---
app.use("/api/admin/staff/login", authLimiter); // Stricter limit specifically for admin login
app.use("/api/admin/staff", adminStaffRoutes);
app.use("/api/admin/products", adminProductsRoutes);
app.use("/api/admin/inventory", adminInventoryRoutes);
app.use("/api/admin/purchases", adminPurchasesRoutes);
app.use("/api/admin/sales", adminSalesRoutes);
app.use("/api/admin/reservations", adminReservationsRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
// budgetRouter is mounted at both /budget and /budgets — server.js did the
// same (plural is what budget-planner.html actually calls; singular kept
// as an alias in case anything else still hits it).
app.use("/api/admin/budget", adminBudgetRoutes);
app.use("/api/admin/budgets", adminBudgetRoutes);
app.use("/api/admin/cash-accounts", adminCashAccountsRoutes);
app.use("/api/admin/cash-transactions", adminCashTransactionsRoutes);
app.use("/api/admin/reports", adminReportsRoutes);
// Was missing entirely — pos.html's live customer search
// (GET /api/admin/customers/search) had nowhere to send its requests.
app.use("/api/admin/customers", adminCustomersRoutes);

// 404 for anything unmatched
app.use((req, res) => res.status(404).json({ error: "Route not found." }));

// Must be last: catches errors passed via next(err) from any controller
app.use(errorHandler);

export default app;