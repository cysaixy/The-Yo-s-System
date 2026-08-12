// src/controllers/admin/dashboardController.js
import pool from "../../config/db.js";

// Every order type the POS and online ordering can produce. The dashboard
// always reports all five so a missing type shows a clean ₱0 row instead
// of disappearing (a real zero looks intentional; a missing row looks
// like a bug).
const ALL_ORDER_TYPES = ["dine_in", "pickup", "delivery", "takeout", "online"];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function num(n) {
  return Number(n) || 0;
}

/* ================================================================
   SECTION 1 — Sales overview as of today
   ================================================================ */
export async function summary(req, res, next) {
  try {
    const [todayRes, bestSellersRes, stockOverviewRes] = await Promise.all([
      // Today's headline numbers, COGS and delivery fees scoped to today so
      // AOV / gross profit / margin are "as of today" like the rest of the
      // dashboard, not all-time.
      pool.query(
        `WITH today_orders AS (
           SELECT o.id, o.order_type, o.total_amount, o.delivery_fee,
                  (SELECT COALESCE(SUM(oi.cost * oi.quantity), 0)
                   FROM order_items oi WHERE oi.order_id = o.id) AS base_cogs,
                  (SELECT COALESCE(SUM(oia.cost * oia.quantity), 0)
                   FROM order_item_add_ons oia
                   JOIN order_items oi2 ON oi2.id = oia.order_item_id
                   WHERE oi2.order_id = o.id) AS addon_cogs
           FROM orders o
           WHERE o.datetime_ordered::date = CURRENT_DATE AND o.status <> 'cancelled'
         )
         SELECT COUNT(*)::int AS order_count,
                COUNT(DISTINCT order_type)::int AS order_types_count,
                COALESCE(SUM(total_amount), 0) AS total_sales,
                COALESCE(SUM(delivery_fee), 0) AS delivery_fees,
                COALESCE(SUM(base_cogs + addon_cogs), 0) AS cogs
         FROM today_orders`
      ),
      // Today's best sellers — top 10 menu items by quantity sold for the
      // Home page. Scoped to CURRENT_DATE so "as of today" stays true.
      pool.query(
        `SELECT mi.name, SUM(oi.quantity)::int AS qty_sold, SUM(oi.subtotal) AS sales_amount
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_id
         JOIN orders o ON o.id = oi.order_id
         WHERE o.datetime_ordered::date = CURRENT_DATE AND o.status <> 'cancelled'
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

    const t = todayRes.rows[0] || {};
    const gross = round2(t.total_sales);
    const cogs = round2(t.cogs);
    const deliveryFees = round2(t.delivery_fees);
    const profit = round2(gross - cogs - deliveryFees);
    const orderCount = num(t.order_count);

    const bestSellers = bestSellersRes.rows;
    const stockOverview = stockOverviewRes.rows;
    const lowStockCount = stockOverview.filter(
      (item) => item.stock_status === "low_stock" || item.stock_status === "out_of_stock"
    ).length;

    res.json({
      todaySales: gross,
      todayOrderCount: orderCount,
      avgOrderValue: orderCount > 0 ? round2(gross / orderCount) : 0,
      grossProfit: profit,
      profitMargin: gross > 0 ? round2((profit / gross) * 100) : 0,
      orderTypesCount: num(t.order_types_count),
      bestSellers,
      lowStockCount,
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 2 — Sales breakdown by order type (+ category) today
   ================================================================ */
export async function salesBreakdown(req, res, next) {
  try {
    const [byOrderTypeRes, byCategoryRes] = await Promise.all([
      pool.query(
        `SELECT order_type, COUNT(*)::int AS order_count,
                COALESCE(SUM(total_amount), 0)::numeric AS total_sales
         FROM orders
         WHERE datetime_ordered::date = CURRENT_DATE AND status <> 'cancelled'
         GROUP BY order_type`
      ),
      pool.query(
        `SELECT c.name AS category_name, COALESCE(SUM(oi.subtotal), 0)::numeric AS total_sales
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_id
         JOIN categories c ON c.id = mi.category_id
         JOIN orders o ON o.id = oi.order_id
         WHERE o.datetime_ordered::date = CURRENT_DATE AND o.status <> 'cancelled'
         GROUP BY c.id, c.name
         ORDER BY total_sales DESC`
      ),
    ]);

    const present = new Map(byOrderTypeRes.rows.map((r) => [r.order_type, r]));
    const byOrderType = ALL_ORDER_TYPES.map((type) => ({
      order_type: type,
      order_count: num(present.get(type)?.order_count),
      total_sales: round2(present.get(type)?.total_sales),
    }));

    res.json({
      byOrderType,
      byCategory: byCategoryRes.rows.map((c) => ({
        category_name: c.category_name,
        total_sales: round2(c.total_sales),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 3 — Monthly sales target (+ progress)
   ================================================================ */
export async function monthlyTarget(req, res, next) {
  try {
    const [salesRes, metaRes, settingRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS month_sales,
                COUNT(*)::int AS month_orders
         FROM orders
         WHERE date_trunc('month', datetime_ordered) = date_trunc('month', CURRENT_DATE)
           AND status <> 'cancelled'`
      ),
      pool.query(
        `SELECT to_char(CURRENT_DATE, 'YYYY-MM') AS month,
                (EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE)
                                   + INTERVAL '1 month' - INTERVAL '1 day')))::int AS days_in_month,
                (EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE)
                                   + INTERVAL '1 month' - CURRENT_DATE)))::int AS days_remaining`
      ),
      pool.query(`SELECT value FROM app_settings WHERE key = 'monthly_sales_target'`),
    ]);

    const target = settingRes.rows[0] ? num(settingRes.rows[0].value) : null;
    const monthSales = round2(salesRes.rows[0].month_sales);
    const meta = metaRes.rows[0];

    res.json({
      month: meta.month,
      month_sales: monthSales,
      month_orders: num(salesRes.rows[0].month_orders),
      target,
      days_in_month: num(meta.days_in_month),
      days_remaining: num(meta.days_remaining),
      progress_percent: target ? round2((monthSales / target) * 100) : 0,
    });
  } catch (err) {
    next(err);
  }
}

export async function setMonthlyTarget(req, res, next) {
  try {
    const target = Number(req.body?.target);
    if (!Number.isFinite(target) || target < 0) {
      return res.status(400).json({ error: "Target must be a non-negative number." });
    }

    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('monthly_sales_target', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [String(target)]
    );
    res.json({ target });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 4 — Top 10 best sellers as of today
   ================================================================ */
export async function bestSellers(req, res, next) {
  try {
    const [rowsRes, totalRes] = await Promise.all([
      pool.query(
        `SELECT mi.id, mi.name, c.name AS category_name,
                SUM(oi.quantity)::int AS qty_sold,
                SUM(oi.subtotal) AS sales_amount
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_id
         LEFT JOIN categories c ON c.id = mi.category_id
         JOIN orders o ON o.id = oi.order_id
         WHERE o.datetime_ordered::date = CURRENT_DATE AND o.status <> 'cancelled'
         GROUP BY mi.id, mi.name, c.name
         ORDER BY qty_sold DESC, sales_amount DESC
         LIMIT 10`
      ),
      pool.query(
        `SELECT COALESCE(SUM(oi.subtotal), 0) AS total
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.datetime_ordered::date = CURRENT_DATE AND o.status <> 'cancelled'`
      ),
    ]);

    const total = round2(totalRes.rows[0].total);
    res.json({
      items: rowsRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        category_name: r.category_name || "Uncategorized",
        qty_sold: num(r.qty_sold),
        sales_amount: round2(r.sales_amount),
        share_percent: total > 0 ? round2((num(r.sales_amount) / total) * 100) : 0,
      })),
      total_sales: total,
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 5 — Sales trend, last 15 days (zero-filled)
   ================================================================ */
export async function salesTrend(req, res, next) {
  try {
    const { rows } = await pool.query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - 14, CURRENT_DATE, '1 day')::date AS day
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              COALESCE(SUM(o.total_amount), 0) AS sales,
              COUNT(o.id)::int AS orders
       FROM days d
       LEFT JOIN orders o ON o.datetime_ordered::date = d.day AND o.status <> 'cancelled'
       GROUP BY d.day
       ORDER BY d.day`
    );

    res.json({
      days: rows.map((r) => ({
        date: r.date,
        sales: round2(r.sales),
        orders: num(r.orders),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 6 — Cash overview as of today
   ================================================================ */
export async function cashOverview(req, res, next) {
  try {
    const [balRes, txRes, salesRes] = await Promise.all([
      // The physical drawer balance (cash-type accounts only).
      pool.query(
        `SELECT COALESCE(SUM(balance), 0) AS current_balance
         FROM cash_accounts
         WHERE account_type = 'cash' AND status = 'active'`
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'in'), 0) AS cash_in,
                COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'out'), 0) AS cash_out,
                COUNT(*)::int AS tx_count
         FROM cash_transactions
         WHERE transaction_date::date = CURRENT_DATE`
      ),
      pool.query(
        `SELECT COALESCE(SUM(p.amount), 0) AS cash_sales,
                COUNT(*)::int AS cash_sale_count
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE p.payment_method = 'cash' AND p.status = 'paid'
           AND o.datetime_ordered::date = CURRENT_DATE`
      ),
    ]);

    const actual = round2(balRes.rows[0].current_balance);
    const cashIn = round2(txRes.rows[0].cash_in);
    const cashOut = round2(txRes.rows[0].cash_out);
    const cashSales = round2(salesRes.rows[0].cash_sales);

    // Opening balance = current balance backed out of today's manual
    // movements. Expected = opening + everything that should have arrived.
    const opening = round2(actual - cashIn + cashOut);
    const expected = round2(opening + cashSales + cashIn - cashOut);
    const variance = round2(actual - expected);

    res.json({
      opening,
      cash_sales: cashSales,
      cash_sale_count: num(salesRes.rows[0].cash_sale_count),
      cash_in: cashIn,
      cash_out: cashOut,
      expected,
      actual,
      variance,
      tx_count: num(txRes.rows[0].tx_count),
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 7 — Cash trend, last 15 days (zero-filled)
   ================================================================ */
export async function cashTrend(req, res, next) {
  try {
    const { rows } = await pool.query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - 14, CURRENT_DATE, '1 day')::date AS day
       ),
       ins AS (
         SELECT transaction_date::date AS day, SUM(amount) AS amt
         FROM cash_transactions WHERE transaction_type = 'in' GROUP BY 1
       ),
       outs AS (
         SELECT transaction_date::date AS day, SUM(amount) AS amt
         FROM cash_transactions WHERE transaction_type = 'out' GROUP BY 1
       ),
       cash_sales AS (
         SELECT o.datetime_ordered::date AS day, SUM(p.amount) AS amt
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE p.payment_method = 'cash' AND p.status = 'paid'
         GROUP BY 1
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              COALESCE(i.amt, 0) AS cash_in,
              COALESCE(o.amt, 0) AS cash_out,
              COALESCE(s.amt, 0) AS cash_sales
       FROM days d
       LEFT JOIN ins i ON i.day = d.day
       LEFT JOIN outs o ON o.day = d.day
       LEFT JOIN cash_sales s ON s.day = d.day
       ORDER BY d.day`
    );

    res.json({
      days: rows.map((r) => ({
        date: r.date,
        cash_in: round2(r.cash_in),
        cash_out: round2(r.cash_out),
        cash_sales: round2(r.cash_sales),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 8 — Inventory overview (raw stock counts)
   ================================================================ */
export async function inventoryOverview(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total_items,
              COUNT(*) FILTER (WHERE stock_quantity <= 0)::int AS out_of_stock,
              COUNT(*) FILTER (WHERE stock_quantity > 0 AND stock_quantity <= reorder_level)::int AS below_reorder,
              COUNT(*) FILTER (WHERE stock_quantity > reorder_level AND stock_quantity <= reorder_level * 1.5)::int AS low_stock,
              COUNT(*) FILTER (WHERE stock_quantity > reorder_level * 1.5)::int AS in_stock
       FROM inventory_items`
    );
    const r = rows[0] || {};
    res.json({
      total_items: num(r.total_items),
      in_stock: num(r.in_stock),
      below_reorder: num(r.below_reorder),
      low_stock: num(r.low_stock),
      out_of_stock: num(r.out_of_stock),
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 9 — Inventory usage as of today
   Products come from today's order_items (POS stock-out), raw
   ingredients come from today's add-on sales mapped through
   addon_inventory. Both are actual transaction data — nothing is
   estimated. Opening qty is derived as closing + used so the numbers
   tie out to the stock screens.
   ================================================================ */
export async function inventoryUsage(req, res, next) {
  try {
    const [productsRes, ingredientsRes] = await Promise.all([
      pool.query(
        `SELECT mi.name AS description, 'pcs' AS unit,
                mi.stock_quantity AS closing_stock,
                SUM(oi.quantity)::numeric AS used_qty
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN menu_items mi ON mi.id = oi.menu_id
         WHERE o.datetime_ordered::date = CURRENT_DATE AND o.status <> 'cancelled'
         GROUP BY mi.id, mi.name, mi.stock_quantity
         ORDER BY used_qty DESC`
      ),
      pool.query(
        `SELECT ii.name AS description, ii.unit AS unit,
                ii.stock_quantity AS closing_stock,
                SUM(oia.quantity * ai.quantity)::numeric AS used_qty
         FROM order_item_add_ons oia
         JOIN order_items oi ON oi.id = oia.order_item_id
         JOIN orders o ON o.id = oi.order_id
         JOIN addon_inventory ai ON ai.addon_id = oia.addon_id
         JOIN inventory_items ii ON ii.id = ai.inventory_id
         WHERE o.datetime_ordered::date = CURRENT_DATE AND o.status <> 'cancelled'
         GROUP BY ii.id, ii.name, ii.unit, ii.stock_quantity
         ORDER BY used_qty DESC`
      ),
    ]);

    const items = [...productsRes.rows, ...ingredientsRes.rows].map((r) => {
      const used = num(r.used_qty);
      const closing = num(r.closing_stock);
      const opening = closing + used;
      return {
        description: r.description,
        unit: r.unit || "pcs",
        opening_qty: opening,
        closing_qty: closing,
        used_qty: used,
        usage_percent: opening > 0 ? round2((used / opening) * 100) : null,
      };
    });

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 10 — Inventory status
   Days of stock needs enough historical consumption to be reliable,
   which the logs don't currently carry for raw ingredients, so it's
   always N/A (the UI renders the null as "N/A") instead of a guess.
   ================================================================ */
export async function inventoryStatus(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, category, sku, stock_quantity, unit, reorder_level, supplier, notes,
              CASE
                WHEN stock_quantity <= 0 THEN 'out_of_stock'
                WHEN stock_quantity <= reorder_level THEN 'below_reorder'
                WHEN stock_quantity <= reorder_level * 1.5 THEN 'low_stock'
                ELSE 'in_stock'
              END AS stock_status
       FROM inventory_items
       ORDER BY CASE
                  WHEN stock_quantity <= 0 THEN 0
                  WHEN stock_quantity <= reorder_level THEN 1
                  WHEN stock_quantity <= reorder_level * 1.5 THEN 2
                  ELSE 3
                END, name ASC`
    );

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category || "Uncategorized",
        sku: r.sku,
        quantity: num(r.stock_quantity),
        unit: r.unit || "pcs",
        stock_status: r.stock_status,
        reorder_level: num(r.reorder_level),
        supplier: r.supplier || null,
        notes: r.notes || null,
        days_of_stock: null,
      })),
    });
  } catch (err) {
    next(err);
  }
}
