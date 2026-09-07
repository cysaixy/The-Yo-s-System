-- ============================================================================
--  Remove the Budget Planner feature from the database.
--
--  The `budgets` table is standalone — no other table has a foreign key that
--  points at it — so dropping it is isolated and does NOT affect orders,
--  inventory, cash transactions, or anything else.
--
--  Recommended: take a backup first, e.g.
--     pg_dump "$DATABASE_URL" -t budgets > budgets_backup.sql
--  so the data can be restored if the client ever changes their mind.
-- ============================================================================

DROP TABLE IF EXISTS budgets;
