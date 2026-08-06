import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import pool from "./config/db.js";

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

// Customer Routes
import customerAuthRouter from "./src/routes/customer/auth.routes.js";
import customerMenuRouter from "./src/routes/customer/menu.routes.js";
import customerOrderRouter from "./src/routes/customer/order.routes.js";
import customerReservationRouter from "./src/routes/customer/reservation.routes.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxy (required for correct IP tracking in express-rate-limit)
app.set("trust proxy", 1);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

// Apply global rate limit to all /api routes
app.use("/api", globalLimiter);

// Health check endpoint
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// --- Customer API Routes ---
app.use("/api/customer/auth", authLimiter, customerAuthRouter);
app.use("/api/customer/menu", customerMenuRouter);
app.use("/api/customer/orders", customerOrderRouter);
app.use("/api/customer/reservations", customerReservationRouter);

// --- Admin API Routes ---
app.use("/api/admin/staff/login", authLimiter);
app.use("/api/admin/products", productRouter);
app.use("/api/admin/dashboard", dashboardRouter);
app.use("/api/admin/inventory", inventoryRouter);
app.use("/api/admin/purchases", purchasesRouter);
app.use("/api/admin/reservations", reservationsRouter); 
app.use("/api/admin/sales", salesRouter);
app.use("/api/admin/staff", staffRouter);

// 404 handler for unmatched routes
app.use((req, res) => res.status(404).json({ error: "Route not found." }));

// Global error handler (catches errors passed via next(err))
app.use(errorHandler);

const startServer = async () => {
  try {
    await pool.query("SELECT NOW()");
    console.log("Connected to database");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to the database:", error.message);
    process.exit(1);
  }
};

startServer();