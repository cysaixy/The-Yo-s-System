import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import errorHandler from "./src/middlewares/error.middleware.js";
import { globalLimiter, authLimiter } from "./src/middlewares/rateLimit.middleware.js";

// Admin Routes
import productRouter from "./src/routes/admin/productsRoutes.js";
import dashboardRouter from "./src/routes/admin/dashboardRoutes.js";
import inventoryRouter from "./src/routes/admin/inventoryRoutes.js";
import purchasesRouter from "./src/routes/admin/purchasesRoutes.js";
import reservationsRouter from "./src/routes/admin/reservationsRoutes.js";
import salesRouter from "./src/routes/admin/salesRoutes.js";
import staffRouter from "./src/routes/admin/staffRoutes.js";
import budgetRouter from "./src/routes/admin/budgetRoutes.js";
import cashAccountsRouter from "./src/routes/admin/cashAccountsRoutes.js";
import cashTransactionsRouter from "./src/routes/admin/cashTransactionsRoutes.js";
import reportsRouter from "./src/routes/admin/reportsRoutes.js";
import customersRouter from "./src/routes/admin/customersRoutes.js";
// Customer Routes
import customerAuthRouter from "./src/routes/customer/auth.routes.js";
import customerMenuRouter from "./src/routes/customer/menu.routes.js";
import customerOrderRouter from "./src/routes/customer/order.routes.js";
import customerReservationRouter from "./src/routes/customer/reservation.routes.js";


// Mount customer authentication routes

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxy (required for correct IP tracking in express-rate-limit)
app.set("trust proxy", 1);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

// Serve the frontend from the same server as the API, so the pages load
// from http://localhost:3000 instead of a separate static server.
//   /frontend/admin/reservations.html  -> frontend/admin/reservations.html
//   /frontend/customer/reservations.html -> frontend/customer/reservations.html
//   /admin/... and /customer/... are aliases so relative asset links
//   (admin-shell.css, global.js, etc.) resolve the same way they do when
//   the folder is opened directly.
app.use("/frontend", express.static(path.join(__dirname, "..", "frontend")));
app.use("/admin", express.static(path.join(__dirname, "..", "frontend", "admin")));
app.use("/customer", express.static(path.join(__dirname, "..", "frontend", "customer")));
// Bare paths work too: http://localhost:3000/ serves the customer site and
// http://localhost:3000/reservations.html resolves to the customer page.
app.use("/", express.static(path.join(__dirname, "..", "frontend", "customer")));

// Apply global rate limit to all /api routes
app.use("/api", globalLimiter);

// Health check endpoint
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// --- Customer API Routes ---

app.use("/api/customer/auth", customerAuthRouter);
app.use("/api/customer/menu", customerMenuRouter);
app.use("/api/customer/orders", customerOrderRouter);
app.use("/api/customer/reservations", customerReservationRouter);

// --- Admin API Routes ---
app.use("/api/admin/staff/login", authLimiter);
app.use("/api/admin/products", productRouter);//check
app.use("/api/admin/dashboard", dashboardRouter);//check
app.use("/api/admin/inventory", inventoryRouter);//check
app.use("/api/admin/purchases", purchasesRouter);//check
app.use("/api/admin/reservations", reservationsRouter);//check
app.use("/api/admin/sales", salesRouter);
app.use("/api/admin/staff", staffRouter);
app.use("/api/admin/budget", budgetRouter);
app.use("/api/admin/cash-transactions", cashTransactionsRouter);
app.use("/api/admin/reports", reportsRouter);
app.use("/api/admin/cash-accounts", cashAccountsRouter);
app.use("/api/admin/cash-transactions", cashTransactionsRouter);
app.use("/api/admin/budgets", budgetRouter);
app.use("/api/admin/customers", customersRouter);
// 404 handler for unmatched routes
app.use((req, res) => res.status(404).json({ error: "Route not found." }));

// Global error handler (catches errors passed via next(err))
app.use(errorHandler);

import { initTables } from "./src/config/initTables.js";

const startServer = async () => {
  try {
    await pool.query("SELECT NOW()");
    console.log("Connected to database");
    await initTables();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to the database:", error.message);
    process.exit(1);
  }
};

startServer();