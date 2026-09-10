-- Remove the retired Budget Planner feature.
-- Production inspection before this migration found 0 rows in budgets.
DROP TABLE IF EXISTS "budgets";
