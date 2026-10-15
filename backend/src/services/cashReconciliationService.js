// src/services/cashReconciliationService.js
//
// Centralised helpers for drawer-account operations so that every call
// site (POS checkout, cancellation, dashboard, reconciliation endpoint)
// shares the same lookup / locking / reconciliation logic.

/**
 * Find the single active default drawer account.
 *
 * @param {object} clientOrPool - pg Pool or checked-out Client
 * @param {{ forUpdate?: boolean }} opts
 * @returns {Promise<object>} The drawer row (id, name, balance, …)
 * @throws {Error} with `.status = 500` when no drawer is configured
 */
export async function getDefaultDrawerAccount(clientOrPool, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const { rows } = await clientOrPool.query(
    `SELECT id, name, account_type, balance, status, is_default_drawer, created_at
     FROM cash_accounts
     WHERE is_default_drawer = TRUE AND status = 'active'${lock}`
  );
  if (!rows[0]) {
    const err = new Error(
      'No active default drawer account configured. ' +
      'Please designate a default drawer account in Cash Accounts.'
    );
    err.status = 500;
    throw err;
  }
  return rows[0];
}

/**
 * Ensure today's daily_reconciliations row exists for `accountId`.
 *
 * Opening balance logic:
 *   1. Look for the most recent prior row with a non-null counted
 *      closing balance (handles skipped / gap days).
 *   2. Fall back to the account's current balance if no prior count
 *      exists (first day / clean cutover).
 *
 * Uses ON CONFLICT … DO NOTHING so concurrent calls are safe.
 *
 * @param {object} clientOrPool
 * @param {number} accountId
 * @returns {Promise<object>} The reconciliation row
 */
export async function getOrCreateTodayReconciliation(clientOrPool, accountId) {
  // Fast path — row already exists
  const { rows: existing } = await clientOrPool.query(
    `SELECT * FROM daily_reconciliations
     WHERE cash_account_id = $1 AND reconciliation_date = CURRENT_DATE`,
    [accountId]
  );
  if (existing[0]) return existing[0];

  // Determine opening balance from the most recent prior physical count
  const { rows: prior } = await clientOrPool.query(
    `SELECT counted_closing_balance
     FROM daily_reconciliations
     WHERE cash_account_id = $1
       AND reconciliation_date < CURRENT_DATE
       AND counted_closing_balance IS NOT NULL
     ORDER BY reconciliation_date DESC
     LIMIT 1`,
    [accountId]
  );

  let openingBalance;
  if (prior[0]) {
    openingBalance = Number(prior[0].counted_closing_balance);
  } else {
    // First day or no prior count — use account's current balance
    const { rows: acct } = await clientOrPool.query(
      'SELECT balance FROM cash_accounts WHERE id = $1',
      [accountId]
    );
    openingBalance = acct[0] ? Number(acct[0].balance) : 0;
  }

  // Insert safely — ON CONFLICT handles the race where another request
  // created it between our SELECT and this INSERT.
  await clientOrPool.query(
    `INSERT INTO daily_reconciliations (cash_account_id, reconciliation_date, opening_balance)
     VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (cash_account_id, reconciliation_date) DO NOTHING`,
    [accountId, openingBalance]
  );

  // Re-read (covers both the fast-insert and the conflict-skip paths)
  const { rows: created } = await clientOrPool.query(
    `SELECT * FROM daily_reconciliations
     WHERE cash_account_id = $1 AND reconciliation_date = CURRENT_DATE`,
    [accountId]
  );
  return created[0];
}

/**
 * Find or auto-provision an active cash account for the given payment method.
 *
 * Routing rules:
 *   - 'cash' -> default drawer account
 *   - 'gcash', 'maya', 'paymaya', 'ewallet' -> active account matching name or type 'ewallet'
 *   - 'bank_transfer', 'card', 'bank' -> active account of type 'bank'
 *   - other -> default drawer account fallback
 *
 * @param {object} clientOrPool
 * @param {string} paymentMethod
 * @param {{ forUpdate?: boolean }} opts
 * @returns {Promise<object>} The cash_accounts row
 */
export async function getAccountForPaymentMethod(clientOrPool, paymentMethod = 'cash', { forUpdate = false } = {}) {
  const method = String(paymentMethod || 'cash').toLowerCase().trim();
  const lock = forUpdate ? ' FOR UPDATE' : '';

  if (method === 'cash') {
    return getDefaultDrawerAccount(clientOrPool, { forUpdate });
  }

  const isEwallet = ['gcash', 'maya', 'paymaya', 'qrph', 'ewallet'].some(k => method.includes(k));
  const isBankOrCard = ['bank', 'bank_transfer', 'card', 'credit_card', 'debit_card'].some(k => method.includes(k));

  if (isEwallet) {
    const pattern = `%${method}%`;
    const { rows } = await clientOrPool.query(
      `SELECT id, name, account_type, balance, status, is_default_drawer, created_at
       FROM cash_accounts
       WHERE status = 'active'
         AND (account_type = 'ewallet' OR LOWER(name) LIKE $1)
       ORDER BY
         CASE WHEN LOWER(name) LIKE $1 THEN 1
              WHEN account_type = 'ewallet' THEN 2
              ELSE 3 END,
         id ASC
       LIMIT 1${lock}`,
      [pattern]
    );
    if (rows[0]) return rows[0];

    // Auto-create default E-Wallet account if none exists yet
    const defaultName = method === 'gcash' ? 'GCash' : (method === 'maya' ? 'Maya' : 'E-Wallet');
    const { rows: created } = await clientOrPool.query(
      `INSERT INTO cash_accounts (name, account_type, balance, status, is_default_drawer)
       VALUES ($1, 'ewallet', 0.00, 'active', FALSE)
       RETURNING id, name, account_type, balance, status, is_default_drawer, created_at`,
      [defaultName]
    );
    return created[0];
  }

  if (isBankOrCard) {
    const { rows } = await clientOrPool.query(
      `SELECT id, name, account_type, balance, status, is_default_drawer, created_at
       FROM cash_accounts
       WHERE status = 'active'
         AND (account_type = 'bank' OR LOWER(name) LIKE '%bank%')
       ORDER BY
         CASE WHEN account_type = 'bank' THEN 1 ELSE 2 END,
         id ASC
       LIMIT 1${lock}`
    );
    if (rows[0]) return rows[0];

    // Auto-create default Bank account if none exists yet
    const { rows: created } = await clientOrPool.query(
      `INSERT INTO cash_accounts (name, account_type, balance, status, is_default_drawer)
       VALUES ('Bank Account', 'bank', 0.00, 'active', FALSE)
       RETURNING id, name, account_type, balance, status, is_default_drawer, created_at`
    );
    return created[0];
  }

  // Fallback: try default drawer, or first active account
  try {
    return await getDefaultDrawerAccount(clientOrPool, { forUpdate });
  } catch {
    const { rows } = await clientOrPool.query(
      `SELECT id, name, account_type, balance, status, is_default_drawer, created_at
       FROM cash_accounts
       WHERE status = 'active'
       ORDER BY is_default_drawer DESC, id ASC
       LIMIT 1${lock}`
    );
    if (rows[0]) return rows[0];
    throw new Error('No active cash account available to receive payment.');
  }
}

/**
 * Post an order sale to the appropriate account (cash drawer, e-wallet, or bank).
 * Can be called inside an already-open transaction or with pool.
 *
 * @param {object} clientOrPool
 * @param {{ orderId: number, paymentMethod?: string, amount: number, staffId?: number|null, description?: string }} opts
 */
export async function postOrderPayment(clientOrPool, { orderId, paymentMethod = 'cash', amount, staffId = null, description = null }) {
  const numAmount = Number(amount) || 0;
  if (numAmount <= 0) return null;

  const account = await getAccountForPaymentMethod(clientOrPool, paymentMethod, { forUpdate: true });

  await clientOrPool.query(
    'UPDATE cash_accounts SET balance = balance + $1 WHERE id = $2',
    [numAmount, account.id]
  );

  const desc = description || `POS Order #${orderId} payment (${paymentMethod || 'cash'})`;

  const { rows } = await clientOrPool.query(
    `INSERT INTO cash_transactions
       (cash_account_id, staff_id, order_id, transaction_type, category, amount, description, transaction_date)
     VALUES ($1, $2, $3, 'in', 'POS Sale', $4, $5, NOW())
     RETURNING id, cash_account_id, amount, description`,
    [account.id, staffId || null, orderId, numAmount, desc]
  );

  if (account.is_default_drawer) {
    await getOrCreateTodayReconciliation(clientOrPool, account.id);
  }

  return rows[0];
}

/**
 * Backward compatibility alias for postOrderPayment for cash drawer.
 */
export async function postCashOrderSale(client, { orderId, amount, staffId }) {
  return postOrderPayment(client, { orderId, paymentMethod: 'cash', amount, staffId });
}

/**
 * Reverse previously-posted sale payments (refund on cancellation).
 * Reverses from every account (cash drawer, e-wallet, bank) that received payment for this order.
 *
 * @param {object} client
 * @param {{ orderId: number, staffId: number|null }} opts
 * @returns {Promise<{ refunded: boolean, amount?: number }>}
 */
export async function reverseCashOrderSale(client, { orderId, staffId }) {
  // 1. Find all 'in' payments posted for this order grouped by cash account
  const { rows: saleRows } = await client.query(
    `SELECT cash_account_id, SUM(amount) AS total
     FROM cash_transactions
     WHERE order_id = $1 AND transaction_type = 'in' AND category IN ('POS Sale', 'Order Sale')
     GROUP BY cash_account_id`,
    [orderId]
  );

  if (!saleRows.length) return { refunded: false, amount: 0 };

  let totalRefunded = 0;

  for (const row of saleRows) {
    const accountId = row.cash_account_id;
    const saleTotal = Number(row.total) || 0;

    // Has a refund already been issued for this account on this order?
    const { rows: refundRows } = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM cash_transactions
       WHERE order_id = $1 AND cash_account_id = $2 AND transaction_type = 'out' AND category IN ('POS Refund', 'Order Refund')`,
      [orderId, accountId]
    );
    const refundedAlready = Number(refundRows[0]?.total) || 0;
    const remainingToRefund = saleTotal - refundedAlready;

    if (remainingToRefund > 0) {
      await client.query(
        'UPDATE cash_accounts SET balance = GREATEST(0, balance - $1) WHERE id = $2',
        [remainingToRefund, accountId]
      );

      await client.query(
        `INSERT INTO cash_transactions
           (cash_account_id, staff_id, order_id, transaction_type, category, amount, description, transaction_date)
         VALUES ($1, $2, $3, 'out', 'POS Refund', $4, $5, NOW())`,
        [accountId, staffId, orderId, remainingToRefund, `POS Order #${orderId} cancellation refund`]
      );

      totalRefunded += remainingToRefund;
    }
  }

  return { refunded: totalRefunded > 0, amount: totalRefunded };
}

