// src/controllers/admin/dashboardController.js
import pool from "../../config/db.js";

export async function summary(req, res, next) {
  try {
    const [todayStatsRes, bestSellersRes, stockOverviewRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS order_count, COALESCE(SUM(total_amount), 0) AS total_sales
         FROM orders
         WHERE datetime_ordered::date = CURRENT_DATE AND status <> 'cancelled'`
      ),
      pool.query(
        `SELECT mi.name, SUM(oi.quantity) AS qty_sold, SUM(oi.subtotal) AS sales_amount
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_id
         JOIN orders o ON o.id = oi.order_id
         WHERE o.status <> 'cancelled'
         GROUP BY mi.name
         ORDER BY qty_sold DESC
         LIMIT 10`
      ),
      pool.query(
        `SELECT id, name, stock_quantity, status,
                CASE
                  WHEN stock_quantity <= 0 THEN 'out_of_stock'
                  WHEN stock_quantity < 5 THEN 'low_stock'
                  WHEN stock_quantity < 15 THEN 'below_reorder'
                  ELSE 'in_stock'
                END AS stock_status
         FROM menu_items
         ORDER BY stock_quantity ASC`
      ),
    ]);

    const todayStats = todayStatsRes.rows[0];
    const bestSellers = bestSellersRes.rows;
    const stockOverview = stockOverviewRes.rows;

    const lowStockCount = stockOverview.filter(
      (item) => item.stock_status === "low_stock" || item.stock_status === "out_of_stock"
    ).length;

    res.json({
      todaySales: parseFloat(todayStats?.total_sales || 0),
      todayOrderCount: parseInt(todayStats?.order_count || 0, 10),
      bestSellers,
      lowStockCount,
    });
  } catch (err) {
    next(err);
  }
}

export async function salesBreakdown(req, res, next) {
  try {
    const [byOrderTypeRes, byCategoryRes] = await Promise.all([
      pool.query(
        `SELECT 
           order_type, 
           COUNT(*)::int AS order_count, 
           COALESCE(SUM(total_amount), 0)::numeric AS total_sales
         FROM orders 
         WHERE status <> 'cancelled'
         GROUP BY order_type`
      ),
      pool.query(
        `SELECT 
           c.name AS category_name, 
           COALESCE(SUM(oi.subtotal), 0)::numeric AS total_sales
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
      byOrderType: byOrderTypeRes.rows,
      byCategory: byCategoryRes.rows,
    });
  } catch (err) {
    next(err);
  }
}