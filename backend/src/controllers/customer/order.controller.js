// src/controllers/customer/order.controller.js
import pool from "../../config/db.js";

const VALID_ORDER_TYPES = ["online", "dine_in", "pickup"];
const VALID_PAYMENT_METHODS = ["cash", "gcash", "card", "bank_transfer"];

export async function createOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const { reservation_id, order_type, cart } = req.body;
    const customer_id = req.user?.customer?.id;

    if (!customer_id) {
      return res.status(400).json({
        error: "No customer profile found for this account. Call /api/customer/auth/sync first.",
      });
    }
    if (!VALID_ORDER_TYPES.includes(order_type)) {
      return res.status(400).json({
        error: `order_type must be one of: ${VALID_ORDER_TYPES.join(", ")}`,
      });
    }
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "cart must be a non-empty array." });
    }

    let total_amount = 0;
    const validatedItems = [];

    // Re-price and check stock directly from database
    for (const line of cart) {
      const { rows } = await client.query(
        "SELECT id, name, price, stock_quantity FROM menu_items WHERE id = $1",
        [line.menu_id]
      );
      const menuItem = rows[0];

      if (!menuItem) {
        return res.status(400).json({ error: `Menu item ${line.menu_id} not found.` });
      }
      if (menuItem.stock_quantity !== null && menuItem.stock_quantity < line.quantity) {
        return res.status(409).json({ error: `${menuItem.name} is out of stock.` });
      }

      validatedItems.push({
        menu_id: menuItem.id,
        quantity: line.quantity,
        price: menuItem.price,
      });
      total_amount += menuItem.price * line.quantity;
    }

    await client.query("BEGIN");

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, staff_id, reservation_id, order_type, status, total_amount, datetime_ordered)
       VALUES ($1, NULL, $2, $3, 'pending', $4, NOW())
       RETURNING id, customer_id, reservation_id, order_type, status, total_amount, datetime_ordered`,
      [customer_id, reservation_id || null, order_type, total_amount]
    );
    const order = orderResult.rows[0];

    for (const item of validatedItems) {
      const subtotal = item.price * item.quantity;

      await client.query(
        `INSERT INTO order_items (order_id, menu_id, quantity, price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.menu_id, item.quantity, item.price, subtotal]
      );

      // Decrement stock if stock tracking applies
      await client.query(
        `UPDATE menu_items 
         SET stock_quantity = stock_quantity - $1 
         WHERE id = $2 AND stock_quantity IS NOT NULL AND stock_quantity >= $1`,
        [item.quantity, item.menu_id]
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

export async function getOrder(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, json_agg(
          json_build_object('menu_id', oi.menu_id, 'quantity', oi.quantity, 'price', oi.price, 'subtotal', oi.subtotal)
       ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ error: "Order not found." });

    // Customers may only view their own orders.
    if (req.user?.customer?.id && rows[0].customer_id !== req.user.customer.id) {
      return res.status(403).json({ error: "You don't have access to this order." });
    }

    res.json({ order: rows[0] });
  } catch (err) {
    next(err);
  }
}

// Lists every order placed by the currently authenticated customer, newest
// first, each with its line items attached — powers the "My Orders" /
// order-tracking page on the frontend.
export async function getCustomerOrders(req, res, next) {
  try {
    const customer_id = req.user?.customer?.id;
    if (!customer_id) {
      return res.status(400).json({
        error: "No customer profile found for this account. Call /api/customer/auth/sync first.",
      });
    }

    const { rows } = await pool.query(
      `SELECT o.*, COALESCE(
          json_agg(
            json_build_object('menu_id', oi.menu_id, 'quantity', oi.quantity, 'price', oi.price, 'subtotal', oi.subtotal)
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
       ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = $1
       GROUP BY o.id
       ORDER BY o.datetime_ordered DESC`,
      [customer_id]
    );

    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

export async function createPayment(req, res, next) {
  try {
    const { id: order_id } = req.params;
    const { payment_method, reference_number } = req.body;

    if (!VALID_PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        error: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(", ")}`,
      });
    }

    const orderResult = await pool.query("SELECT total_amount FROM orders WHERE id = $1", [order_id]);
    const order = orderResult.rows[0];

    if (!order) return res.status(404).json({ error: "Order not found." });

    const { rows } = await pool.query(
      `INSERT INTO payments (order_id, payment_method, amount, reference_number, status, datetime_paid)
       VALUES ($1, $2, $3, $4, 'paid', NOW())
       RETURNING *`,
      [order_id, payment_method, order.total_amount, reference_number || null]
    );

    res.status(201).json({ payment: rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function getPayment(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM payments WHERE order_id = $1",
      [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ error: "No payment found for this order." });
    res.json({ payment: rows[0] });
  } catch (err) {
    next(err);
  }
}