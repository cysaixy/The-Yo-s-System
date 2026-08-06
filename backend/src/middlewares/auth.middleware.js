// src/middlewares/auth.middleware.js
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

export async function requireStaffAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    
    if (!token) {
      return res.status(401).json({ error: "Missing auth token." });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const staffId = payload.staffId || payload.id || payload.staff_id;

    if (!staffId) {
      return res.status(401).json({ error: "Invalid token payload structure." });
    }

    // Direct SQL query fetching staff along with permissions
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.email, s.role, s.status,
              p.can_access_inventory, p.can_access_stock_in, p.can_access_reports
       FROM staff s
       LEFT JOIN staff_permissions p ON p.staff_id = s.id
       WHERE s.id = $1`,
      [staffId]
    );

    const staff = rows[0];

    if (!staff || staff.status !== "active") {
      return res.status(401).json({ error: "Invalid or inactive staff account." });
    }

    req.staff = staff;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    console.error("Auth middleware internal error:", err);
    return res.status(500).json({ error: "Internal server error during authentication." });
  }
}