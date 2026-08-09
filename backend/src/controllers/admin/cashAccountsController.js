// src/controllers/admin/cashAccountsController.js
import pool from "../../config/db.js";

const VALID_TYPES = ["cash", "bank", "ewallet"];

export async function listAccounts(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, account_type, balance, status, created_at
       FROM cash_accounts
       ORDER BY status ASC, name ASC`
    );
    res.json({ accounts: rows });
  } catch (err) {
    next(err);
  }
}

export async function createAccount(req, res, next) {
  try {
    const { name, account_type, balance } = req.body;
    if (!name || !VALID_TYPES.includes(account_type)) {
      return res.status(400).json({ error: `name is required and account_type must be one of: ${VALID_TYPES.join(", ")}` });
    }
    const { rows } = await pool.query(
      `INSERT INTO cash_accounts (name, account_type, balance)
       VALUES ($1, $2, $3)
       RETURNING id, name, account_type, balance, status, created_at`,
      [name, account_type, Number(balance) || 0]
    );
    res.status(201).json({ account: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updateAccount(req, res, next) {
  try {
    const { name, account_type, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE cash_accounts
       SET name = COALESCE($1, name),
           account_type = COALESCE($2, account_type),
           status = COALESCE($3, status)
       WHERE id = $4
       RETURNING id, name, account_type, balance, status, created_at`,
      [name || null, account_type || null, status || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Cash account not found." });
    res.json({ account: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req, res, next) {
  try {
    const { rowCount } = await pool.query(`DELETE FROM cash_accounts WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Cash account not found." });
    res.status(204).send();
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({ error: "Cannot delete an account that already has transactions. Archive it instead." });
    }
    next(err);
  }
}
