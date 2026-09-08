-- Non-destructive compatibility repair for the existing production staff table.
-- Run this in the Neon SQL Editor only after taking a backup.
-- It preserves all staff rows and can be safely re-run.

BEGIN;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS can_access_inventory BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_stock_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_reports BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS staff_email_key
  ON public.staff (email);

COMMIT;

-- Verification: all six required login/profile fields should return true.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'status'
  ) AS has_status,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'can_access_inventory'
  ) AS has_inventory_permission,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'can_access_stock_in'
  ) AS has_stock_in_permission,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'can_access_reports'
  ) AS has_reports_permission,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'created_at'
  ) AS has_created_at,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'staff' AND indexname = 'staff_email_key'
  ) AS has_unique_email_index;
