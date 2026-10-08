// src/controllers/admin/staff.controller.js
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../../config/db.js';
import { generateStaffToken } from '../../utils/generateToken.js';

const COOKIE_NAME = 'staff_token';

// This account is the permanent owner-level admin.
// Its role, status, and permissions can never be changed by anyone — not
// even by another Admin — through the API. Password changes are still
// allowed (only by the account itself, verified via current password).
const SUPERADMIN_EMAIL = 'admin@theyos.com';

/**
 * Shared password strength validator.
 * Returns an error string if invalid, or null if the password is acceptable.
 */
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Password must be at least 10 characters.';
  }
  return null;
}
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 24 * 60 * 60 * 1000, // 1 day
  path: '/',
};

function setCSRFTokenCookie(res) {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
  return csrfToken;
}

export function issueCSRFToken(req, res) {
  const csrfToken = setCSRFTokenCookie(res);
  res.json({ csrfToken });
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { rows } = await pool.query(
      `SELECT s.*, p.can_access_inventory, p.can_access_stock_in, p.can_access_reports
       FROM staff s
       LEFT JOIN staff_permissions p ON p.staff_id = s.id
       WHERE LOWER(s.email) = LOWER($1)`,
      [email.trim()]
    );
    const staff = rows[0];

    if (!staff || staff.status !== 'active') {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!staff.password) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    let matches = false;
    try {
      matches = await bcrypt.compare(password, staff.password);
    } catch (bcryptErr) {
      console.error('[staffController.login] bcrypt compare failed:', bcryptErr?.message || bcryptErr);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!matches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateStaffToken(staff.id);
    delete staff.password;

    // Set httpOnly session cookie
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    // Set separate non-httpOnly CSRF token cookie (frontend reads this,
    // sends it back as X-CSRF-Token header on state-changing requests)
    const csrfToken = setCSRFTokenCookie(res);

    res.json({ staff, csrfToken });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: 0 });
    res.json({ success: true, message: 'Logged out successfully.' });
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

    if (!rows[0]) return res.status(404).json({ error: 'Staff member not found.' });
    res.json({ staff: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function createStaff(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      name,
      email,
      password,
      role,
      can_access_inventory,
      can_access_stock_in,
      can_access_reports,
    } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required.' });
    }
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    // The database permission columns are NOT NULL and have no defaults.
    // Omitted permissions start disabled; explicit false values stay false.
    const permissionValues = [
      can_access_inventory ?? false,
      can_access_stock_in ?? false,
      can_access_reports ?? false,
    ];
    if (permissionValues.some((value) => typeof value !== 'boolean')) {
      return res.status(400).json({ error: 'Staff permissions must be boolean values.' });
    }

    const existingRes = await client.query('SELECT id FROM staff WHERE email = $1', [email]);
    if (existingRes.rows.length > 0) {
      return res.status(409).json({ error: 'A staff account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO staff (name, email, password, role, status, created_at)
       VALUES ($1, $2, $3, $4, 'active', NOW())
       RETURNING id, name, email, role, status, created_at`,
      [name, email, hashedPassword, role || 'Cashier']
    );
    const staff = rows[0];

    await client.query(
      `INSERT INTO staff_permissions
         (staff_id, can_access_inventory, can_access_stock_in, can_access_reports)
       VALUES ($1, $2, $3, $4)`,
      [staff.id, ...permissionValues]
    );

    await client.query('COMMIT');
    res.status(201).json({ staff });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

export async function updateStaff(req, res, next) {
  try {
    const { name, role, status } = req.body;

    // Fetch the target account's email first so we can apply the superadmin guard.
    const { rows: target } = await pool.query(
      'SELECT email FROM staff WHERE id = $1',
      [req.params.id]
    );
    if (!target[0]) return res.status(404).json({ error: 'Staff member not found.' });

    if (target[0].email.toLowerCase() === SUPERADMIN_EMAIL) {
      return res.status(403).json({
        error: 'This account is protected and cannot be modified.',
      });
    }

    const { rows } = await pool.query(
      `UPDATE staff SET
         name = COALESCE($1, name),
         role = COALESCE($2, role),
         status = COALESCE($3, status)
       WHERE id = $4
       RETURNING id, name, email, role, status`,
      [name, role, status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Staff member not found.' });
    res.json({ staff: rows[0] });
  } catch (err) {
    next(err);
  }
}

// PUT/PATCH /api/admin/staff/:id/profile
// Any logged-in staff can update their own name.
// Admin can also update their own email (email is unique — checked here).
// No other role or status changes — use updateStaff for those.
export async function updateProfile(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    const requesterId = Number(req.staff.id);

    // Staff can only edit their own profile. Admins can edit any profile,
    // but in practice settings.html only ever calls this for self.
    if (requesterId !== targetId && req.staff.role !== 'Admin') {
      return res.status(403).json({ error: 'You can only update your own profile.' });
    }

    const { name, email } = req.body;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({ error: 'Name cannot be empty.' });
    }

    // Email changes are Admin-only — prevents privilege abuse through email swap.
    if (email !== undefined && req.staff.role !== 'Admin') {
      return res.status(403).json({ error: 'Only an Admin can change their email address.' });
    }

    if (email !== undefined) {
      const cleanEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      // Check uniqueness — exclude the current staff member's own row.
      const { rows: existing } = await pool.query(
        'SELECT id FROM staff WHERE LOWER(email) = $1 AND id != $2',
        [cleanEmail, targetId]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: 'That email address is already in use.' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE staff SET
         name  = COALESCE($1, name),
         email = COALESCE($2, email)
       WHERE id = $3
       RETURNING id, name, email, role, status`,
      [
        name ? name.trim() : null,
        email ? email.trim().toLowerCase() : null,
        targetId,
      ]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Staff member not found.' });

    res.json({ staff: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updatePermissions(req, res, next) {
  try {
    const { can_access_inventory, can_access_stock_in, can_access_reports } = req.body;

    // Superadmin permissions are fixed — no changes allowed.
    const { rows: target } = await pool.query(
      'SELECT email FROM staff WHERE id = $1',
      [req.params.id]
    );
    if (!target[0]) return res.status(404).json({ error: 'Staff member not found.' });

    if (target[0].email.toLowerCase() === SUPERADMIN_EMAIL) {
      return res.status(403).json({
        error: 'This account is protected and cannot be modified.',
      });
    }

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

    if (!rows[0]) return res.status(404).json({ error: 'Staff member not found.' });
    res.json({ permissions: rows[0] });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/staff/:id/password — lets a signed-in staff member change
// their own password (settings.html). Verifies the current password before
// writing the new one; only the account's owner (or an Admin) may use it.
export async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    const { id } = req.params;

    if (req.staff.role !== 'Admin' && String(req.staff.id) !== String(id)) {
      return res.status(403).json({ error: 'You can only change your own password.' });
    }
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new passwords are required.' });
    }
    const passwordError = validatePassword(new_password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const { rows } = await pool.query(
      'SELECT id, password FROM staff WHERE id = $1',
      [id]
    );
    const staff = rows[0];
    if (!staff) return res.status(404).json({ error: 'Staff member not found.' });

    const matches = await bcrypt.compare(current_password, staff.password);
    if (!matches) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE staff SET password = $1 WHERE id = $2', [hashedPassword, staff.id]);

    res.json({ success: true, message: 'Password updated.' });
  } catch (err) {
    next(err);
  }
}