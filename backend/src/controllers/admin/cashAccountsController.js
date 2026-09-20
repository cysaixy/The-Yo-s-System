// src/controllers/admin/cashAccountsController.js
import pool from '../../config/db.js';
import { getOrCreateTodayReconciliation } from '../../services/cashReconciliationService.js';

const VALID_TYPES = ['cash', 'bank', 'ewallet'];

export async function listAccounts(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, account_type, balance, status, is_default_drawer, created_at
       FROM cash_accounts
       ORDER BY status ASC, is_default_drawer DESC, name ASC`
    );
    res.json({ accounts: rows });
  } catch (err) {
    next(err);
  }
}

export async function createAccount(req, res, next) {
  try {
    const { name, account_type, balance, status } = req.body;
    if (!name || !VALID_TYPES.includes(account_type)) {
      return res.status(400).json({ error: `name is required and account_type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const { rows } = await pool.query(
      `INSERT INTO cash_accounts (name, account_type, balance, status)
       VALUES ($1, $2, $3, COALESCE($4, 'active'))
       RETURNING id, name, account_type, balance, status, is_default_drawer, created_at`,
      [name, account_type, Number(balance) || 0, status || null]
    );
    res.status(201).json({ account: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updateAccount(req, res, next) {
  try {
    const { name, account_type, status, is_default_drawer } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (is_default_drawer === true) {
        await client.query(
          'UPDATE cash_accounts SET is_default_drawer = FALSE WHERE is_default_drawer = TRUE'
        );
      }

      const { rows } = await client.query(
        `UPDATE cash_accounts
         SET name = COALESCE($1, name),
             account_type = COALESCE($2, account_type),
             status = COALESCE($3, status),
             is_default_drawer = COALESCE($4, is_default_drawer)
         WHERE id = $5
         RETURNING id, name, account_type, balance, status, is_default_drawer, created_at`,
        [name || null, account_type || null, status || null, is_default_drawer === true ? true : null, req.params.id]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Cash account not found.' });
      }
      await client.query('COMMIT');
      res.json({ account: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: account } = await client.query(
      'SELECT is_default_drawer FROM cash_accounts WHERE id = $1',
      [req.params.id]
    );
    if (!account[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cash account not found.' });
    }

    if (account[0].is_default_drawer) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cannot delete the default drawer account. Unset it as default first.' });
    }

    const { rowCount } = await client.query('DELETE FROM cash_accounts WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cash account not found.' });
    }
    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete an account that already has transactions. Archive it instead.' });
    }
    next(err);
  } finally {
    client.release();
  }
}

export async function getReconciliation(req, res, next) {
  try {
    const { accountId } = req.params;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const dateStr = date.toISOString().split('T')[0];

    const { rows } = await pool.query(
      `SELECT dr.*, ca.name AS account_name
       FROM daily_reconciliations dr
       JOIN cash_accounts ca ON ca.id = dr.cash_account_id
       WHERE dr.cash_account_id = $1 AND dr.reconciliation_date = $2`,
      [accountId, dateStr]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Reconciliation not found for this date.' });
    }
    res.json({ reconciliation: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function getOrCreateReconciliation(req, res, next) {
  try {
    const { accountId } = req.params;

    const { rows: account } = await pool.query(
      'SELECT id, balance FROM cash_accounts WHERE id = $1',
      [accountId]
    );
    if (!account[0]) {
      return res.status(404).json({ error: 'Cash account not found.' });
    }

    // Check if reconciliation exists BEFORE ensuring it, so we can
    // accurately report whether it was newly created.
    const { rows: before } = await pool.query(
      `SELECT * FROM daily_reconciliations
       WHERE cash_account_id = $1 AND reconciliation_date = CURRENT_DATE`,
      [accountId]
    );
    const existedBefore = !!before[0];

    const reconciliation = await getOrCreateTodayReconciliation(pool, accountId);

    // Row was newly created only if it didn't exist before this call
    const created = !existedBefore;

    res.json({ reconciliation, created });
  } catch (err) {
    next(err);
  }
}

export async function closeReconciliation(req, res, next) {
  const client = await pool.connect();
  try {
    const { accountId } = req.params;
    const { counted_closing_balance, notes } = req.body;
    const staffId = req.staff?.id || null;

    if (counted_closing_balance === undefined || counted_closing_balance === null) {
      return res.status(400).json({ error: 'counted_closing_balance is required.' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM daily_reconciliations
       WHERE cash_account_id = $1 AND reconciliation_date = CURRENT_DATE
       FOR UPDATE`,
      [accountId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No reconciliation found for today. Open it first.' });
    }
    if (rows[0].counted_closing_balance !== null) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Today\'s reconciliation is already closed.' });
    }

    await client.query(
      `UPDATE daily_reconciliations
       SET counted_closing_balance = $1,
           closed_by_staff_id = $2,
           closed_at = NOW(),
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [Number(counted_closing_balance), staffId, notes || null, rows[0].id]
    );

    await client.query('COMMIT');

    const { rows: updated } = await client.query(
      'SELECT * FROM daily_reconciliations WHERE id = $1',
      [rows[0].id]
    );

    res.json({ reconciliation: updated[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

export async function listReconciliations(req, res, next) {
  try {
    const { accountId } = req.params;
    const { from, to, limit = 30 } = req.query;

    const conditions = ['cash_account_id = $1'];
    const params = [accountId];
    let paramIndex = 2;

    if (from) {
      conditions.push(`reconciliation_date >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }
    if (to) {
      conditions.push(`reconciliation_date <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    params.push(Math.min(Number(limit), 100));

    const { rows } = await pool.query(
      `SELECT * FROM daily_reconciliations
       WHERE ${conditions.join(' AND ')}
       ORDER BY reconciliation_date DESC
       LIMIT $${paramIndex}`,
      params
    );

    res.json({ reconciliations: rows });
  } catch (err) {
    next(err);
  }
}

export async function getDefaultDrawer(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, account_type, balance, status, is_default_drawer, created_at
       FROM cash_accounts
       WHERE is_default_drawer = TRUE AND status = 'active'`
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'No active default drawer configured.' });
    }
    res.json({ drawer: rows[0] });
  } catch (err) {
    next(err);
  }
}