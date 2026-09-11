import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the shared Express app (routes, middleware, error handler)
import app from "./src/app.js";

import { initTables } from "./src/config/initTables.js";

const PORT = process.env.PORT || 3000;

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