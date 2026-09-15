-- ============================================================
-- Cash drawer flag, order traceability & daily reconciliation
-- ============================================================
-- 1. Mark a single cash account as the default POS drawer.
-- 2. Link cash_transactions to orders for audit traceability.
-- 3. Create daily_reconciliations for shift-based drawer counts.
-- ============================================================

-- --------------------------------------------------------------
-- 1. cash_accounts.is_default_drawer
-- --------------------------------------------------------------
ALTER TABLE cash_accounts
  ADD COLUMN IF NOT EXISTS is_default_drawer BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one account can be the default drawer at any time.
CREATE UNIQUE INDEX IF NOT EXISTS cash_accounts_single_default_drawer_idx
  ON cash_accounts (is_default_drawer) WHERE (is_default_drawer = TRUE);

-- --------------------------------------------------------------
-- 2. cash_transactions.order_id
-- --------------------------------------------------------------
ALTER TABLE cash_transactions
  ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cash_transactions_order_id_idx
  ON cash_transactions(order_id);

-- --------------------------------------------------------------
-- 3. daily_reconciliations table
-- --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_reconciliations (
  id                     SERIAL PRIMARY KEY,
  cash_account_id        INTEGER NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  reconciliation_date    DATE NOT NULL,
  opening_balance        NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  counted_closing_balance NUMERIC(10, 2),
  closed_by_staff_id     INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  closed_at              TIMESTAMPTZ,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_reconciliations_account_date_uq
    UNIQUE (cash_account_id, reconciliation_date)
);

CREATE INDEX IF NOT EXISTS daily_reconciliations_date_idx
  ON daily_reconciliations(reconciliation_date);
