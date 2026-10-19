import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./src/config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the shared Express app (routes, middleware, error handler)
import app from "./src/app.js";

import { initTables } from "./src/config/initTables.js";
import { startOverdueReservationCron } from "./src/services/overdueReservationService.js";

const PORT = process.env.PORT || 3000;

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Serve the frontend from the same server as the API, so the pages load
// from http://localhost:3000 instead of a separate static server.
app.use("/frontend", express.static(path.join(__dirname, "..", "frontend")));
app.use("/admin", express.static(path.join(__dirname, "..", "frontend", "admin")));
app.use("/customer", express.static(path.join(__dirname, "..", "frontend", "customer")));

// Clean URL rewrites — mirrors vercel.json so localhost:3000/about works
// the same as production (no .html extension needed).
const customerPages = [
  'about', 'menu', 'gallery', 'order', 'reviews', 'reservations',
  'my-orders', 'account', 'index',
];
customerPages.forEach(page => {
  app.get(`/${page}`, (_req, res) =>
    res.sendFile(path.join(__dirname, "..", "frontend", "customer", page === 'reviews' ? 'reviews.html' : `${page}.html`))
  );
});

const adminPages = [
  'home', 'dashboard', 'pos', 'sales', 'reservations', 'inventory',
  'products', 'purchases', 'cash-transactions', 'cash-accounts',
  'staff', 'settings', 'login',
];
// /admin  → admin/home.html
app.get('/admin', (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "frontend", "admin", "home.html"))
);
adminPages.forEach(page => {
  app.get(`/admin/${page}`, (_req, res) =>
    res.sendFile(path.join(__dirname, "..", "frontend", "admin", `${page}.html`))
  );
});

// Root → customer index
app.use("/", express.static(path.join(__dirname, "..", "frontend", "customer")));

const startServer = async () => {
  try {
    await pool.query("SELECT NOW()");
    console.log("Connected to database");
    await initTables();

    startOverdueReservationCron();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Server address:`, server.address());
    });

server.on('error', (err) => {
      console.error('Server error:', err);
    });
  } catch (error) {
    console.error("Failed to connect to the database:", error.message);
    process.exit(1);
  }
};

startServer();