// src/controllers/admin/budgetController.js
import pool from "../../config/db.js";

// Normalizes any date-ish string to the 1st of that month, since budgets
// are tracked per calendar month (e.g. "2026-08-15" -> "2026-08-01").
function normalizeMonth(value) {
  const d = new Date(value);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function list(req, res, next) {
  try {
    const { month } = req.query;
    const conditions = [];
    const params = [];

    if (month) {
      const normalized = normalizeMonth(month);
      if (!normalized) return res.status(400).json({ error: "Invalid month value." });
      params.push(normalized);
      conditions.push(`b.budget_month = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Actual spend is pulled live from cash_transactions (type='out') in
    // the same category/month, so the planner always reflects real data
    // rather than a number you'd have to update by hand.
    const { rows } = await pool.query(
      `SELECT budgets.id, budgets.category, budgets.budget_month, budgets.planned_amount, budgets.notes,
              COALESCE(actual.spent, 0) AS actual_spent
       FROM budgets
       LEFT JOIN (
         SELECT LOWER(BTRIM(category)) AS category_key, date_trunc('month', transaction_date)::date AS month, SUM(amount) AS spent
         FROM cash_transactions
         WHERE transaction_type = 'out' AND NULLIF(BTRIM(category), '') IS NOT NULL
         GROUP BY LOWER(BTRIM(category)), date_trunc('month', transaction_date)
       ) actual ON actual.category_key = LOWER(BTRIM(budgets.category)) AND actual.month = budgets.budget_month
       ${where}
       ORDER BY budgets.budget_month DESC, budgets.category ASC`,
      params
    );
    res.json({ budgets: rows });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { category, budget_month, planned_amount, notes } = req.body || {};
    const cleanCategory = String(category || "").trim();
    const normalized = normalizeMonth(budget_month);

    if (!cleanCategory || !normalized || planned_amount === undefined || planned_amount < 0) {
      return res.status(400).json({ error: "category, budget_month, and a non-negative planned_amount are required." });
    }

    const { rows } = await pool.query(
      `INSERT INTO budgets (category, budget_month, planned_amount, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING id, category, budget_month, planned_amount, notes`,
      [cleanCategory, normalized, planned_amount, notes || null]
    );
    res.status(201).json({ budget: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A budget for this category and month already exists." });
    }
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { planned_amount, notes } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE budgets
       SET planned_amount = COALESCE($1, planned_amount),
           notes = COALESCE($2, notes)
       WHERE id = $3
       RETURNING id, category, budget_month, planned_amount, notes`,
      [planned_amount, notes, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Budget entry not found." });
    res.json({ budget: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const { rowCount } = await pool.query(`DELETE FROM budgets WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Budget entry not found." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
