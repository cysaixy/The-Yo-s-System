// src/controllers/admin/reportsController.js
import pool from "../../config/db.js";

// A single consolidated reports endpoint. Note: this overlaps on purpose
// with dashboardController.salesBreakdown (order type/category) and
// salesController.salesReport (payment method) — those stay as-is for
// whatever already depends on them; this just gives one place to fetch
// all three together for a dedicated Reports page later.
export async function summary(req, res, next) {
  try {
    const [byPaymentMethodRes, byOrderTypeRes, byCategoryRes] = await Promise.all([
      pool.query(
        `SELECT payment_method, COUNT(*) AS transaction_count, SUM(amount) AS total_amount
         FROM payments
         WHERE status = 'paid'
         GROUP BY payment_method
         ORDER BY total_amount DESC`
      ),
      pool.query(
        `SELECT order_type, COUNT(*)::int AS order_count, COALESCE(SUM(total_amount), 0)::numeric AS total_sales
         FROM orders
         WHERE status <> 'cancelled'
         GROUP BY order_type`
      ),
      pool.query(
        `SELECT c.name AS category_name, COALESCE(SUM(oi.subtotal), 0)::numeric AS total_sales
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_id
         JOIN categories c ON c.id = mi.category_id
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status <> 'cancelled'
         GROUP BY c.id, c.name
         ORDER BY total_sales DESC`
      ),
    ]);

    res.json({
      byPaymentMethod: byPaymentMethodRes.rows,
      byOrderType: byOrderTypeRes.rows,
      byCategory: byCategoryRes.rows,
    });
  } catch (err) {
    next(err);
  }
}
