// src/controllers/admin/sales.controller.js
import pool from "../../config/db.js";

const VALID_ORDER_TYPES = ["dine_in", "pickup"];

export async function createPosOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const { customer_id, order_type, cart } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: "customer_id is required." });
    }
    if (!VALID_ORDER_TYPES.includes(order_type)) {
      return res.status(400).json({ error: `order_type must be one of: ${VALID_ORDER_TYPES.join(", ")}` });
    }
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "cart must be a non-empty array." });
    }

    let total_amount = 0;
    const validatedItems = [];

    for (const line of cart) {
      const { rows } = await client.query(
        "SELECT id, name, price, stock_quantity FROM menu_items WHERE id = $1",
        [line.menu_id]
      );
      const menuItem = rows[0];

      if (!menuItem) {
        return res.status(400).json({ error: `Menu item ${line.menu_id} not found.` });
      }
      if (menuItem.stock_quantity < line.quantity) {
        return res.status(409).json({ error: `${menuItem.name} is out of stock.` });
      }

      validatedItems.push({ menu_id: menuItem.id, quantity: line.quantity, price: menuItem.price });
      total_amount += menuItem.price * line.quantity;
    }

    await client.query("BEGIN");

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, staff_id, reservation_id, order_type, status, total_amount, datetime_ordered)
       VALUES ($1, $2, NULL, $3, 'pending', $4, NOW())
       RETURNING id, customer_id, staff_id, order_type, status, total_amount, datetime_ordered`,
      [customer_id, req.staff.id, order_type, total_amount]
    );
    const order = orderResult.rows[0];

    for (const item of validatedItems) {
      const subtotal = item.price * item.quantity;

      await client.query(
        `INSERT INTO order_items (order_id, menu_id, quantity, price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.menu_id, item.quantity, item.price, subtotal]
      );

      const decrement = await client.query(
        `UPDATE menu_items SET stock_quantity = stock_quantity - $1
         WHERE id = $2 AND stock_quantity >= $1
         RETURNING id`,
        [item.quantity, item.menu_id]
      );

      if (decrement.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: `Not enough stock for menu item ${item.menu_id}.` });
      }

      await client.query(
        `INSERT INTO inventory_log (menu_id, staff_id, transaction_type, quantity_change, remarks)
         VALUES ($1, $2, 'sale', $3, $4)`,
        [item.menu_id, req.staff.id, -item.quantity, `Order #${order.id}`]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ order });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

export async function listOrders(req, res, next) {
  try {
    const { from, to, status } = req.query;
    const conditions = [];
    const params = [];

    if (from) { params.push(from); conditions.push(`o.datetime_ordered::date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`o.datetime_ordered::date <= $${params.length}`); }
    if (status) { params.push(status); conditions.push(`o.status = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT o.id, c.name AS customer_name, s.name AS staff_name, o.order_type,
              o.status, o.total_amount, o.datetime_ordered
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN staff s ON s.id = o.staff_id
       ${where}
       ORDER BY o.datetime_ordered DESC`,
      params
    );
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

export async function getOrder(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, json_agg(
          json_build_object('menu_id', oi.menu_id, 'quantity', oi.quantity, 'price', oi.price, 'subtotal', oi.subtotal)
       ) AS items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ error: "Order not found." });
    res.json({ order: rows[0] });
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

export async function salesReport(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT payment_method, COUNT(*) AS transaction_count, SUM(amount) AS total_amount
       FROM payments WHERE status = 'paid'
       GROUP BY payment_method
       ORDER BY total_amount DESC`
    );
    res.json({ byPaymentMethod: rows });
  } catch (err) {
    next(err);
  }
}