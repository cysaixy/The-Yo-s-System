// src/controllers/admin/salesController.js
import pool from "../../config/db.js";

const VALID_ORDER_TYPES = ["dine_in", "pickup"];
const VALID_PAYMENT_METHODS = ["cash", "card", "gcash", "bank_transfer", "other"];

// orders.customer_id is NOT NULL in the schema, so walk-in POS sales (no
// account, no lookup) can't just omit it. Instead we reuse a single shared
// placeholder customers row for every walk-in - created once, then reused
// on every subsequent order that doesn't have a real customer attached.
// Staff can still search and attach a real customer when it's useful
// (repeat customers, loyalty tracking), but it's optional, not required.
const WALK_IN_EMAIL = "walkin@theyos.pos";

async function getOrCreateWalkInCustomerId(client) {
  const existing = await client.query(
    `SELECT id FROM customers WHERE email = $1 LIMIT 1`,
    [WALK_IN_EMAIL]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await client.query(
    `INSERT INTO customers (name, email) VALUES ('Walk-in Customer', $1) RETURNING id`,
    [WALK_IN_EMAIL]
  );
  return created.rows[0].id;
}

// Build a reusable "period + status" WHERE fragment. `paramStart` lets
// callers chain multiple fragments together with positional params.
function periodWhere({ from, to, status = "!cancelled" }, paramStart = 1) {
  const conditions = [];
  const params = [];
  let n = paramStart;

  if (from) { params.push(from); conditions.push(`o.datetime_ordered::date >= $${n}`); n++; }
  if (to)   { params.push(to);   conditions.push(`o.datetime_ordered::date <= $${n}`); n++; }
  if (status === "!cancelled") conditions.push(`o.status <> 'cancelled'`);
  else if (status) { params.push(status); conditions.push(`o.status = $${n}`); n++; }

  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params, nextIndex: n };
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/* ================================================================
   CREATE POS ORDER — handles add-ons, payment, COGS and inventory
   ================================================================ */
export async function createPosOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const { customer_id, order_type, cart, delivery_fee, payment_method } = req.body;
    const deliveryFee = round2(delivery_fee);
    const payMethod = String(payment_method || "cash").toLowerCase();

    if (!VALID_ORDER_TYPES.includes(order_type)) {
      return res.status(400).json({ error: `order_type must be one of: ${VALID_ORDER_TYPES.join(", ")}` });
    }
    if (!VALID_PAYMENT_METHODS.includes(payMethod)) {
      return res.status(400).json({ error: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(", ")}` });
    }
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "cart must be a non-empty array." });
    }

    let total_amount = 0;
    const validatedItems = [];

    for (const line of cart) {
      const menuQty = Number(line.quantity);
      if (!menuQty || menuQty < 1) {
        return res.status(400).json({ error: "Each cart line needs a positive quantity." });
      }

      const { rows } = await client.query(
        "SELECT id, name, price, cost, stock_quantity FROM menu_items WHERE id = $1",
        [line.menu_id]
      );
      const menuItem = rows[0];

      if (!menuItem) {
        return res.status(400).json({ error: `Menu item ${line.menu_id} not found.` });
      }
      if (Number(menuItem.stock_quantity) < menuQty) {
        return res.status(409).json({ error: `${menuItem.name} is out of stock.` });
      }

      const addons = [];
      if (Array.isArray(line.add_ons)) {
        for (const ad of line.add_ons) {
          const aQty = Number(ad.quantity);
          if (!aQty || aQty < 1) {
            return res.status(400).json({ error: "Add-on quantities must be positive." });
          }

          const { rows: aRows } = await client.query(
            `SELECT id, name, price, cost, status FROM add_ons WHERE id = $1`,
            [ad.addon_id]
          );
          const addon = aRows[0];
          if (!addon) {
            return res.status(400).json({ error: `Add-on ${ad.addon_id} not found.` });
          }
          if (addon.status === "unavailable") {
            return res.status(409).json({ error: `${addon.name} is unavailable.` });
          }

          // An add-on with NO product links is a global add-on and can go on
          // any product. Otherwise it must be explicitly linked to this one.
          const { rows: anyLink } = await client.query(
            `SELECT 1 FROM addon_products WHERE addon_id = $1 LIMIT 1`,
            [addon.id]
          );
          if (anyLink.length > 0) {
            const { rows: productLink } = await client.query(
              `SELECT 1 FROM addon_products WHERE addon_id = $1 AND menu_id = $2 LIMIT 1`,
              [addon.id, menuItem.id]
            );
            if (productLink.length === 0) {
              return res.status(400).json({ error: `${addon.name} is not available for ${menuItem.name}.` });
            }
          }

          // Check linked raw ingredients have enough stock for the add-on qty.
          const { rows: comps } = await client.query(
            `SELECT ai.inventory_id, ai.quantity, ai.unit, ii.name AS inventory_name, ii.stock_quantity
             FROM addon_inventory ai
             JOIN inventory_items ii ON ii.id = ai.inventory_id
             WHERE ai.addon_id = $1`,
            [addon.id]
          );
          for (const comp of comps) {
            if (Number(comp.stock_quantity) < Number(comp.quantity) * aQty) {
              return res.status(409).json({ error: `${addon.name} is out of stock (missing ${comp.inventory_name}).` });
            }
          }

          addons.push({
            id: addon.id,
            name: addon.name,
            quantity: aQty,
            price: round2(addon.price),
            cost: round2(addon.cost || 0),
            inventory_components: comps,
          });
        }
      }

      const addonsTotal = addons.reduce((s, a) => s + a.price * a.quantity, 0);
      validatedItems.push({
        menu_id: menuItem.id,
        quantity: menuQty,
        price: round2(menuItem.price),
        cost: round2(menuItem.cost || 0),
        notes: line.notes || null,
        addons,
      });
      total_amount += menuItem.price * menuQty + addonsTotal;
    }

    total_amount = round2(total_amount + deliveryFee);

    await client.query("BEGIN");

    const resolvedCustomerId = customer_id || await getOrCreateWalkInCustomerId(client);

    // POS sales are paid at the counter, so they start already completed.
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, staff_id, reservation_id, order_type, status, total_amount, delivery_fee, datetime_ordered)
       VALUES ($1, $2, NULL, $3, 'completed', $4, $5, NOW())
       RETURNING id, customer_id, staff_id, order_type, status, total_amount, delivery_fee, datetime_ordered`,
      [resolvedCustomerId, req.staff.id, order_type, total_amount, deliveryFee]
    );
    const order = orderResult.rows[0];

    for (const item of validatedItems) {
      const subtotal = item.price * item.quantity;

      const { rows: oiRows } = await client.query(
        `INSERT INTO order_items (order_id, menu_id, quantity, price, cost, subtotal, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [order.id, item.menu_id, item.quantity, item.price, item.cost, subtotal, item.notes]
      );
      const orderItemId = oiRows[0].id;

      for (const a of item.addons) {
        await client.query(
          `INSERT INTO order_item_add_ons (order_item_id, addon_id, name, quantity, price, cost, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [orderItemId, a.id, a.name, a.quantity, a.price, a.cost, a.price * a.quantity]
        );

        // Deduct the add-on's raw ingredients from inventory.
        for (const comp of a.inventory_components) {
          const consumed = Number(comp.quantity) * a.quantity;
          await client.query(
            `UPDATE inventory_items SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2`,
            [consumed, comp.inventory_id]
          );
          await client.query(
            `INSERT INTO inventory_log (menu_id, staff_id, transaction_type, quantity_change, remarks)
             VALUES ($1, $2, 'sale', $3, $4)`,
            [item.menu_id, req.staff.id, -consumed, `POS Order #${order.id} · ${a.name}`]
          );
        }
      }

      await client.query(
        `UPDATE menu_items SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2`,
        [item.quantity, item.menu_id]
      );
      await client.query(
        `INSERT INTO inventory_log (menu_id, staff_id, transaction_type, quantity_change, remarks)
         VALUES ($1, $2, 'sale', $3, $4)`,
        [item.menu_id, req.staff.id, -item.quantity, `POS Order #${order.id}`]
      );
    }

    const paymentResult = await client.query(
      `INSERT INTO payments (order_id, payment_method, amount, status, datetime_paid)
       VALUES ($1, $2, $3, 'paid', NOW())
       RETURNING id, order_id, payment_method, amount, status, datetime_paid`,
      [order.id, payMethod, total_amount]
    );

    await client.query("COMMIT");
    res.status(201).json({ order: { ...order, payment: paymentResult.rows[0] } });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

/* ================================================================
   LIST ORDERS (transactions table)
   ================================================================ */
export async function listOrders(req, res, next) {
  try {
    const { from, to, status, order_type, payment, search, limit } = req.query;
    const conditions = [];
    const params = [];

    if (from) { params.push(from); conditions.push(`o.datetime_ordered::date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`o.datetime_ordered::date <= $${params.length}`); }
    if (status) { params.push(status); conditions.push(`o.status = $${params.length}`); }
    if (order_type) { params.push(order_type); conditions.push(`o.order_type = $${params.length}`); }
    if (payment) {
      params.push(payment);
      conditions.push(`EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.payment_method = $${params.length})`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR s.name ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rowLimit = Math.min(Number(limit) || 500, 2000);

    const { rows } = await pool.query(
      `SELECT o.id, c.name AS customer_name, s.name AS staff_name, o.order_type,
              o.status, o.total_amount, o.delivery_fee, o.datetime_ordered,
              o.reservation_id,
              CASE WHEN o.staff_id IS NULL THEN 'online' ELSE 'pos' END AS source,
              (SELECT p.payment_method FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1) AS payment_method,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN staff s ON s.id = o.staff_id
       ${where}
       ORDER BY o.datetime_ordered DESC
       LIMIT ${rowLimit}`,
      params
    );
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   GET ONE ORDER — items, add-ons, payment, COGS & profit
   ================================================================ */
export async function getOrder(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
              s.name AS staff_name,
              r.reservation_date, r.reservation_time,
              CASE WHEN o.staff_id IS NULL THEN 'online' ELSE 'pos' END AS source
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN staff s ON s.id = o.staff_id
       LEFT JOIN reservations r ON r.id = o.reservation_id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Order not found." });
    const order = rows[0];

    const { rows: items } = await pool.query(
      `SELECT oi.id, oi.menu_id, mi.name AS product_name, mi.price AS current_price,
              oi.quantity, oi.price, oi.cost, oi.subtotal, oi.notes
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_id
       WHERE oi.order_id = $1
       ORDER BY oi.id`,
      [order.id]
    );

    const itemsWithAddons = await Promise.all(items.map(async (item) => {
      const { rows: addons } = await pool.query(
        `SELECT oia.id, oia.addon_id, oia.name, oia.quantity, oia.price, oia.cost, oia.subtotal
         FROM order_item_add_ons oia
         WHERE oia.order_item_id = $1
         ORDER BY oia.id`,
        [item.id]
      );
      const cogs = Number(item.cost || 0) * Number(item.quantity) +
        addons.reduce((s, a) => s + Number(a.cost || 0) * Number(a.quantity), 0);
      const profit = Number(item.subtotal) + addons.reduce((s, a) => s + Number(a.subtotal), 0) - cogs;
      return { ...item, add_ons: addons, cogs: round2(cogs), profit: round2(profit) };
    }));

    const { rows: payments } = await pool.query(
      `SELECT id, payment_method, amount, status, datetime_paid, reference_number
       FROM payments WHERE order_id = $1 ORDER BY id`,
      [order.id]
    );

    const cogs = itemsWithAddons.reduce((s, it) => s + it.cogs, 0);
    const revenue = round2(order.total_amount);
    const profit = round2(revenue - cogs - round2(order.delivery_fee || 0));
    const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0;

    res.json({
      order: {
        ...order,
        items: itemsWithAddons,
        payments,
        cogs: round2(cogs),
        profit,
        margin,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE orders SET status = $1 WHERE id = $2 RETURNING id, status`,
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Order not found." });
    res.json({ order: rows[0] });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   UPDATE DELIVERY FEE — atomic swap so total_amount stays in sync
   without needing to re-derive the subtotal or race a concurrent edit.
   ================================================================ */
export async function updateDeliveryFee(req, res, next) {
  const client = await pool.connect();
  try {
    const { delivery_fee } = req.body;
    const newFee = round2(delivery_fee);

    if (delivery_fee === undefined || delivery_fee === null || isNaN(newFee) || newFee < 0) {
      return res.status(400).json({ error: "delivery_fee must be a non-negative number." });
    }

    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE orders
       SET total_amount = round((total_amount - COALESCE(delivery_fee, 0) + $1)::numeric, 2),
           delivery_fee = $1
       WHERE id = $2
       RETURNING id, delivery_fee, total_amount`,
      [newFee, req.params.id]
    );

    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found." });
    }

    await client.query("COMMIT");
    res.json({ order: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

export async function listPayments(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.order_id, p.payment_method, p.amount, p.datetime_paid, p.status
       FROM payments p ORDER BY p.datetime_paid DESC NULLS LAST`
    );
    res.json({ payments: rows });
  } catch (err) {
    next(err);
  }
}

export async function updatePaymentStatus(req, res, next) {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE payments SET status = $1 WHERE id = $2 RETURNING id, order_id, status`,
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Payment not found." });
    res.json({ payment: rows[0] });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SALES REPORTS
   ================================================================ */

// Top-level summary: gross sales, COGS, delivery fees, profit, margin,
// order count, average order value + add-on totals.
export async function salesSummary(req, res, next) {
  try {
    const { where, params } = periodWhere({ from: req.query.from, to: req.query.to });

    const { rows } = await pool.query(
      `WITH agg AS (
         SELECT o.id, o.total_amount, o.delivery_fee,
                (SELECT COALESCE(SUM(oi.cost * oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS base_cogs,
                (SELECT COALESCE(SUM(oia.cost * oia.quantity), 0)
                 FROM order_item_add_ons oia
                 JOIN order_items oi2 ON oi2.id = oia.order_item_id
                 WHERE oi2.order_id = o.id) AS addon_cogs
         FROM orders o ${where}
       )
       SELECT COUNT(*)::int AS order_count,
              COALESCE(SUM(total_amount), 0) AS gross_sales,
              COALESCE(SUM(delivery_fee), 0) AS delivery_fees,
              COALESCE(SUM(base_cogs + addon_cogs), 0) AS cogs
       FROM agg`,
      params
    );

    const { rows: addonRows } = await pool.query(
      `SELECT COALESCE(SUM(oia.quantity), 0)::int AS addon_units,
              COALESCE(SUM(oia.subtotal), 0) AS addon_revenue,
              COUNT(DISTINCT o.id)::int AS addon_order_count
       FROM order_item_add_ons oia
       JOIN order_items oi ON oi.id = oia.order_item_id
       JOIN orders o ON o.id = oi.order_id
       ${where}`,
      params
    );

    const s = rows[0] || {};
    const grossSales = round2(s.gross_sales);
    const deliveryFees = round2(s.delivery_fees);
    const cogs = round2(s.cogs);
    const profit = round2(grossSales - cogs - deliveryFees);
    const orderCount = Number(s.order_count) || 0;

    res.json({
      summary: {
        order_count: orderCount,
        gross_sales: grossSales,
        delivery_fees: deliveryFees,
        cogs,
        profit,
        margin: grossSales > 0 ? round2((profit / grossSales) * 100) : 0,
        aov: orderCount > 0 ? round2(grossSales / orderCount) : 0,
        addon_units: Number(addonRows[0]?.addon_units) || 0,
        addon_revenue: round2(addonRows[0]?.addon_revenue),
        addon_order_count: Number(addonRows[0]?.addon_order_count) || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Daily breakdown across the period.
export async function dailySales(req, res, next) {
  try {
    const { where, params } = periodWhere({ from: req.query.from, to: req.query.to });

    const { rows } = await pool.query(
      `WITH per_order AS (
         SELECT o.id, to_char(o.datetime_ordered::date, 'YYYY-MM-DD') AS date,
                o.total_amount, o.delivery_fee,
                (SELECT COALESCE(SUM(oi.cost * oi.quantity), 0)
                 FROM order_items oi WHERE oi.order_id = o.id) AS base_cogs,
                (SELECT COALESCE(SUM(oia.cost * oia.quantity), 0)
                 FROM order_item_add_ons oia
                 JOIN order_items oi2 ON oi2.id = oia.order_item_id
                 WHERE oi2.order_id = o.id) AS addon_cogs
         FROM orders o ${where}
       )
       SELECT date,
              COUNT(*)::int AS order_count,
              COALESCE(SUM(total_amount), 0) AS gross_sales,
              COALESCE(SUM(delivery_fee), 0) AS delivery_fees,
              COALESCE(SUM(base_cogs + addon_cogs), 0) AS cogs
       FROM per_order
       GROUP BY date
       ORDER BY date`,
      params
    );

    res.json({
      daily: rows.map(d => {
        const gross = round2(d.gross_sales);
        const cogs = round2(d.cogs);
        const profit = round2(gross - cogs - round2(d.delivery_fees));
        return {
          date: d.date,
          order_count: Number(d.order_count),
          gross_sales: gross,
          delivery_fees: round2(d.delivery_fees),
          cogs,
          profit,
          margin: gross > 0 ? round2((profit / gross) * 100) : 0,
          aov: Number(d.order_count) > 0 ? round2(gross / Number(d.order_count)) : 0,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

// Top-selling add-ons by revenue.
export async function topAddonsReport(req, res, next) {
  try {
    const { where, params } = periodWhere({ from: req.query.from, to: req.query.to });

    const { rows } = await pool.query(
      `SELECT oia.addon_id, oia.name,
              SUM(oia.quantity)::int AS quantity_sold,
              SUM(oia.subtotal) AS revenue,
              SUM(oia.cost * oia.quantity) AS cogs,
              COUNT(DISTINCT o.id)::int AS order_count
       FROM order_item_add_ons oia
       JOIN order_items oi ON oi.id = oia.order_item_id
       JOIN orders o ON o.id = oi.order_id
       ${where}
       GROUP BY oia.addon_id, oia.name
       ORDER BY revenue DESC
       LIMIT 20`,
      params
    );

    res.json({
      addons: rows.map(a => {
        const revenue = round2(a.revenue);
        const cogs = round2(a.cogs);
        const profit = round2(revenue - cogs);
        return {
          addon_id: a.addon_id,
          name: a.name,
          quantity_sold: Number(a.quantity_sold),
          revenue,
          cogs,
          profit,
          margin: revenue > 0 ? round2((profit / revenue) * 100) : 0,
          order_count: Number(a.order_count),
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

// Per-product sales (add-on revenue attributed to the product).
export async function productSalesReport(req, res, next) {
  try {
    const { where, params } = periodWhere({ from: req.query.from, to: req.query.to });

    const { rows } = await pool.query(
      `WITH per_item AS (
         SELECT oi.menu_id, mi.name AS product_name, c.name AS category_name,
                oi.quantity, oi.price, oi.cost,
                (SELECT COALESCE(SUM(oia.price * oia.quantity), 0)
                 FROM order_item_add_ons oia WHERE oia.order_item_id = oi.id) AS addon_revenue,
                (SELECT COALESCE(SUM(oia.cost * oia.quantity), 0)
                 FROM order_item_add_ons oia WHERE oia.order_item_id = oi.id) AS addon_cogs
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN menu_items mi ON mi.id = oi.menu_id
         LEFT JOIN categories c ON c.id = mi.category_id
         ${where}
       )
       SELECT menu_id, product_name, category_name,
              SUM(quantity)::int AS quantity_sold,
              SUM(price * quantity) AS revenue,
              SUM(cost * quantity) AS cogs,
              SUM(addon_revenue) AS addon_revenue,
              SUM(addon_cogs) AS addon_cogs
       FROM per_item
       GROUP BY menu_id, product_name, category_name
       ORDER BY (SUM(price * quantity) + SUM(addon_revenue)) DESC
       LIMIT 100`,
      params
    );

    res.json({
      products: rows.map(p => {
        const revenue = round2(p.revenue);
        const addonRevenue = round2(p.addon_revenue);
        const totalRevenue = round2(revenue + addonRevenue);
        const cogs = round2(p.cogs);
        const addonCogs = round2(p.addon_cogs);
        const totalCogs = round2(cogs + addonCogs);
        const profit = round2(totalRevenue - totalCogs);
        return {
          menu_id: p.menu_id,
          product_name: p.product_name,
          category_name: p.category_name,
          quantity_sold: Number(p.quantity_sold),
          revenue,
          addon_revenue: addonRevenue,
          total_revenue: totalRevenue,
          cogs: totalCogs,
          profit,
          margin: totalRevenue > 0 ? round2((profit / totalRevenue) * 100) : 0,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

// Per-category sales.
export async function categorySalesReport(req, res, next) {
  try {
    const { where, params } = periodWhere({ from: req.query.from, to: req.query.to });

    const { rows } = await pool.query(
      `WITH per_item AS (
         SELECT oi.menu_id, mi.category_id, c.name AS category_name,
                oi.quantity, oi.price, oi.cost,
                (SELECT COALESCE(SUM(oia.cost * oia.quantity), 0)
                 FROM order_item_add_ons oia WHERE oia.order_item_id = oi.id) AS addon_cogs
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN menu_items mi ON mi.id = oi.menu_id
         LEFT JOIN categories c ON c.id = mi.category_id
         ${where}
       )
       SELECT category_id, category_name,
              SUM(quantity)::int AS quantity_sold,
              SUM(price * quantity) AS revenue,
              SUM(cost * quantity + addon_cogs) AS cogs
       FROM per_item
       GROUP BY category_id, category_name
       ORDER BY revenue DESC`,
      params
    );

    res.json({
      categories: rows.map(c => {
        const revenue = round2(c.revenue);
        const cogs = round2(c.cogs);
        const profit = round2(revenue - cogs);
        return {
          category_id: c.category_id,
          category_name: c.category_name || "Uncategorized",
          quantity_sold: Number(c.quantity_sold),
          revenue,
          cogs,
          profit,
          margin: revenue > 0 ? round2((profit / revenue) * 100) : 0,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

// Payment method breakdown.
export async function salesReport(req, res, next) {
  try {
    const { where, params } = periodWhere({ from: req.query.from, to: req.query.to });
    // periodWhere already emits "WHERE ..." including the non-cancelled
    // order guard; the payments aggregate just needs the paid guard chained.
    const whereStr = `${where} AND p.status = 'paid'`;

    const { rows } = await pool.query(
      `SELECT p.payment_method, COUNT(*)::int AS transaction_count, SUM(p.amount) AS total_amount
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       ${whereStr}
       GROUP BY p.payment_method
       ORDER BY total_amount DESC`,
      params
    );

    res.json({ byPaymentMethod: rows });
  } catch (err) {
    next(err);
  }
}

// Order type breakdown.
export async function orderTypesReport(req, res, next) {
  try {
    const { where, params } = periodWhere({ from: req.query.from, to: req.query.to });

    const { rows } = await pool.query(
      `SELECT o.order_type, COUNT(*)::int AS order_count, SUM(o.total_amount) AS total_amount
       FROM orders o ${where}
       GROUP BY o.order_type
       ORDER BY total_amount DESC`,
      params
    );

    res.json({
      orderTypes: rows.map(r => ({
        order_type: r.order_type,
        order_count: Number(r.order_count),
        total_amount: round2(r.total_amount),
      })),
    });
  } catch (err) {
    next(err);
  }
}