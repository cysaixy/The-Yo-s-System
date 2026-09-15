// src/controllers/admin/cashTransactionsController.js
import pool from '../../config/db.js';

export async function listTransactions(req, res, next) {
  try {
    const { transaction_type, cash_account_id, order_id, from, to } = req.query;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (transaction_type) {
      conditions.push(`ct.transaction_type = $${paramIndex}`);
      params.push(transaction_type);
      paramIndex++;
    }
    if (cash_account_id) {
      conditions.push(`ct.cash_account_id = $${paramIndex}`);
      params.push(cash_account_id);
      paramIndex++;
    }
    if (order_id) {
      conditions.push(`ct.order_id = $${paramIndex}`);
      params.push(order_id);
      paramIndex++;
    }
    if (from) {
      conditions.push(`ct.transaction_date >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }
    if (to) {
      conditions.push(`ct.transaction_date <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT ct.id, ct.cash_account_id, ct.staff_id, ct.order_id,
              ct.transaction_type, ct.category, ct.amount, ct.description, ct.transaction_date,
              ca.name AS account_name,
              s.name AS staff_name,
              o.order_type, o.total_amount AS order_total, o.status AS order_status,
              COALESCE(o.customer_name, c.name) AS order_customer
       FROM cash_transactions ct
       JOIN cash_accounts ca ON ca.id = ct.cash_account_id
       LEFT JOIN staff s ON s.id = ct.staff_id
       LEFT JOIN orders o ON o.id = ct.order_id
       LEFT JOIN customers c ON c.id = o.customer_id
       ${where}
       ORDER BY ct.transaction_date DESC, ct.id DESC`,
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
    const { cash_account_id, transaction_type, amount, category, description, order_id } = req.body;

    if (!cash_account_id || !['in', 'out'].includes(transaction_type) || !amount || Number(amount) <= 0) {
      return res.status(400).json({
        error: 'cash_account_id, a positive amount, and transaction_type (\'in\' or \'out\') are required.',
      });
    }

    const staffId = req.staff?.id || null;
    const delta = transaction_type === 'in' ? Number(amount) : -Number(amount);

    await client.query('BEGIN');

    // Prevent an account from going negative on a cash-out.
    const balanceCheck = await client.query(
      'UPDATE cash_accounts SET balance = balance + $1 WHERE id = $2 AND balance + $1 >= 0 RETURNING id, balance',
      [delta, cash_account_id]
    );
    if (balanceCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This would take the account balance below zero.' });
    }

    const { rows } = await client.query(
      `INSERT INTO cash_transactions (cash_account_id, transaction_type, amount, category, description, staff_id, order_id, transaction_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, cash_account_id, transaction_type, amount, category, description, transaction_date, order_id`,
      [cash_account_id, transaction_type, amount, category || null, description || null, staffId, order_id || null]
    );

    await client.query('COMMIT');
    res.status(201).json({ transaction: rows[0], newBalance: balanceCheck.rows[0].balance });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}