// src/controllers/admin/reportsController.js
import pool from '../../config/db.js';
import { periodWhere } from '../admin/salesController.js'; // reuse the periodWhere helper

// A single consolidated reports endpoint. Note: this overlaps on purpose
// with dashboardController.salesBreakdown (order type/category) and
// salesController.salesReport (payment method) — those stay as-is for
// whatever already depends on them; this just gives one place to fetch
// all three together for a dedicated Reports page later.
export async function summary(req, res, next) {
  try {
    const { from, to, date_type, store_hour } = req.query;
    const { where, params } = periodWhere({ from, to, dateType: date_type, storeHour: store_hour });

    const paymentWhere = `${where} AND p.status = 'paid'`;

    const [byPaymentMethodRes, byOrderTypeRes, byCategoryRes] = await Promise.all([
      pool.query(
        `SELECT p.payment_method, COUNT(*)::int AS transaction_count, SUM(p.amount) AS total_amount
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         ${paymentWhere}
         GROUP BY p.payment_method
         ORDER BY total_amount DESC`,
        params
      ),
      pool.query(
        `SELECT o.order_type, COUNT(*)::int AS order_count, COALESCE(SUM(o.total_amount), 0)::numeric AS total_sales
         FROM orders o
         ${where}
         GROUP BY o.order_type`
      ),
      pool.query(
        `SELECT c.name AS category_name, COALESCE(SUM(oi.subtotal), 0)::numeric AS total_sales
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_id
         JOIN categories c ON c.id = mi.category_id
         JOIN orders o ON o.id = oi.order_id
         ${where}
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
