// src/controllers/admin/staff.controller.js
import bcrypt from "bcrypt";
import pool from "../../config/db.js";
import { generateStaffToken } from "../../utils/generateToken.js";

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const { rows } = await pool.query("SELECT * FROM staff WHERE email = $1", [email]);
    const staff = rows[0];

    if (!staff || staff.status !== "active") {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const matches = await bcrypt.compare(password, staff.password);
    if (!matches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = generateStaffToken(staff.id);
    delete staff.password;

    res.json({ token, staff });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    res.json({ staff: req.staff });
  } catch (err) {
    next(err);
  }
}

export async function listStaff(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.email, s.role, s.status, s.created_at,
              p.can_access_inventory, p.can_access_stock_in, p.can_access_reports
       FROM staff s
       LEFT JOIN staff_permissions p ON p.staff_id = s.id
       ORDER BY s.created_at DESC`
    );
    res.json({ staff: rows });
  } catch (err) {
    next(err);
  }
}

export async function getStaffById(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.email, s.role, s.status, s.created_at,
              p.can_access_inventory, p.can_access_stock_in, p.can_access_reports
       FROM staff s
       LEFT JOIN staff_permissions p ON p.staff_id = s.id
       WHERE s.id = $1`,
      [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ error: "Staff member not found." });
    res.json({ staff: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function createStaff(req, res, next) {
  const client = await pool.connect();
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required." });
    }

    const existingRes = await client.query("SELECT id FROM staff WHERE email = $1", [email]);
    if (existingRes.rows.length > 0) {
      return res.status(409).json({ error: "A staff account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO staff (name, email, password, role, status, created_at)
       VALUES ($1, $2, $3, $4, 'active', NOW())
       RETURNING id, name, email, role, status, created_at`,
      [name, email, hashedPassword, role || "Cashier"]
    );
    const staff = rows[0];

    await client.query(
      `INSERT INTO staff_permissions (staff_id) VALUES ($1)`,
      [staff.id]
    );

    await client.query("COMMIT");
    res.status(201).json({ staff });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

export async function updateStaff(req, res, next) {
  try {
    const { name, role, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE staff SET
         name = COALESCE($1, name),
         role = COALESCE($2, role),
         status = COALESCE($3, status)
       WHERE id = $4
       RETURNING id, name, email, role, status`,
      [name, role, status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Staff member not found." });
    res.json({ staff: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updatePermissions(req, res, next) {
  try {
    const { can_access_inventory, can_access_stock_in, can_access_reports } = req.body;
    const { rows } = await pool.query(
      `UPDATE staff_permissions
       SET can_access_inventory = $2, can_access_stock_in = $3, can_access_reports = $4, updated_at = NOW()
       WHERE staff_id = $1
       RETURNING *`,
      [
        req.params.id,
        !!can_access_inventory,
        !!can_access_stock_in,
        !!can_access_reports,
      ]
    );

    if (!rows[0]) return res.status(404).json({ error: "Staff member not found." });
    res.json({ permissions: rows[0] });
  } catch (err) {
    next(err);
  }
}