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
 * Post a cash sale to the default drawer.
 * Must be called inside an already-open transaction (client with BEGIN).
 *
 * @param {object} client   - pg Client inside a transaction
 * @param {{ orderId: number, amount: number, staffId: number|null }} opts
 */
export async function postCashOrderSale(client, { orderId, amount, staffId }) {
  const drawer = await getDefaultDrawerAccount(client, { forUpdate: true });

  await client.query(
    'UPDATE cash_accounts SET balance = balance + $1 WHERE id = $2',
    [amount, drawer.id]
  );

  await client.query(
    `INSERT INTO cash_transactions
       (cash_account_id, staff_id, order_id, transaction_type, category, amount, description, transaction_date)
     VALUES ($1, $2, $3, 'in', 'POS Sale', $4, $5, NOW())`,
    [drawer.id, staffId, orderId, amount, `POS Order #${orderId} payment (cash)`]
  );

  // Ensure today's reconciliation row exists so the dashboard has an
  // opening balance to work with even before anyone manually opens
  // the reconciliation page.
  await getOrCreateTodayReconciliation(client, drawer.id);
}

/**
 * Reverse a previously-posted cash sale (refund on cancellation).
 * Must be called inside an already-open transaction.
 *
 * Includes:
 *  - Double-refund guard (no-op if a refund already exists).
 *  - Negative-balance clamping (GREATEST(0, …)).
 *
 * @param {object} client
 * @param {{ orderId: number, staffId: number|null }} opts
 * @returns {Promise<{ refunded: boolean, amount?: number }>}
 */
export async function reverseCashOrderSale(client, { orderId, staffId }) {
  // 1. Was cash ever posted for this order?
  const { rows: saleRows } = await client.query(
    `SELECT SUM(amount) AS total
     FROM cash_transactions
     WHERE order_id = $1 AND transaction_type = 'in' AND category = 'POS Sale'`,
    [orderId]
  );
  const saleTotal = Number(saleRows[0]?.total) || 0;
  if (saleTotal <= 0) return { refunded: false }; // no cash to reverse

  // 2. Has a refund already been issued?
  const { rows: refundRows } = await client.query(
    `SELECT SUM(amount) AS total
     FROM cash_transactions
     WHERE order_id = $1 AND transaction_type = 'out' AND category = 'POS Refund'`,
    [orderId]
  );
  const refundedAlready = Number(refundRows[0]?.total) || 0;
  if (refundedAlready >= saleTotal) return { refunded: false }; // already fully refunded

  const refundAmount = saleTotal - refundedAlready;

  // 3. Lock drawer, decrement balance (clamped to 0)
  const drawer = await getDefaultDrawerAccount(client, { forUpdate: true });

  await client.query(
    'UPDATE cash_accounts SET balance = GREATEST(0, balance - $1) WHERE id = $2',
    [refundAmount, drawer.id]
  );

  await client.query(
    `INSERT INTO cash_transactions
       (cash_account_id, staff_id, order_id, transaction_type, category, amount, description, transaction_date)
     VALUES ($1, $2, $3, 'out', 'POS Refund', $4, $5, NOW())`,
    [drawer.id, staffId, orderId, refundAmount, `POS Order #${orderId} cancellation refund`]
  );

  return { refunded: true, amount: refundAmount };
}
