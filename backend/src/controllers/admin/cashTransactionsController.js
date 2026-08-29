// src/controllers/admin/cashTransactionsController.js
import pool from "../../config/db.js";

export async function listTransactions(req, res, next) {
  try {
    const { transaction_type } = req.query;
    const conditions = [];
    const params = [];

    if (transaction_type) {
      params.push(transaction_type);
      conditions.push(`cash_transactions.transaction_type = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT cash_transactions.id, cash_transactions.transaction_type, cash_transactions.amount,
              cash_transactions.category, cash_transactions.description, cash_transactions.transaction_date,
              cash_accounts.name AS account_name, staff.name AS staff_name
       FROM cash_transactions
       JOIN cash_accounts ON cash_accounts.id = cash_transactions.cash_account_id
       LEFT JOIN staff ON staff.id = cash_transactions.staff_id
       ${where}
       ORDER BY cash_transactions.transaction_date DESC`,
      params
    );
    res.json({ transactions: rows });
  } catch (err) {
    next(err);
  }
}

export async function createTransaction(req, res, next) {
  const client = await pool.connect();
  try {
    const { cash_account_id, transaction_type, amount, category, description } = req.body;

    if (!cash_account_id || !["in", "out"].includes(transaction_type) || !amount || Number(amount) <= 0) {
      return res.status(400).json({
        error: "cash_account_id, a positive amount, and transaction_type ('in' or 'out') are required.",
      });
    }

    const staffId = req.staff?.id || null;
    const delta = transaction_type === "in" ? Number(amount) : -Number(amount);

    await client.query("BEGIN");

    // Prevent an account from going negative on a cash-out.
    const balanceCheck = await client.query(
      `UPDATE cash_accounts SET balance = balance + $1 WHERE id = $2 AND balance + $1 >= 0 RETURNING id, balance`,
      [delta, cash_account_id]
    );
    if (balanceCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This would take the account balance below zero." });
    }

    const { rows } = await client.query(
      `INSERT INTO cash_transactions (cash_account_id, transaction_type, amount, category, description, staff_id, transaction_date)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, cash_account_id, transaction_type, amount, category, description, transaction_date`,
      [cash_account_id, transaction_type, amount, category || null, description || null, staffId]
    );

    await client.query("COMMIT");
    res.status(201).json({ transaction: rows[0], newBalance: balanceCheck.rows[0].balance });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}
