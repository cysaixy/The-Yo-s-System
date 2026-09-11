// src/controllers/customer/order.controller.js
import pool from '../../config/db.js';
import { restoreOrderInventory } from '../../utils/inventoryRestore.js';

const VALID_ORDER_TYPES = ['online', 'delivery', 'dine_in', 'pickup'];
const VALID_PAYMENT_METHODS = ['cash', 'gcash', 'card', 'bank_transfer'];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function createOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      reservation_id,
      order_type,
      cart,
      notes,
      delivery_address,
      customer_name,
      customer_phone,
      payment_method,
    } = req.body;
    const customer_id = req.user?.customer?.id;

    if (!customer_id) {
      return res.status(400).json({
        error: 'No customer profile found for this account. Call /api/customer/auth/sync first.',
      });
    }
    if (!VALID_ORDER_TYPES.includes(order_type)) {
      return res.status(400).json({
        error: `order_type must be one of: ${VALID_ORDER_TYPES.join(', ')}`,
      });
    }
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'cart must be a non-empty array.' });
    }
    if (payment_method && !VALID_PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        error: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
      });
    }

    // Delivery orders require the customer to provide a
    // delivery location and a contact number. Customers can NEVER set the
    // delivery location and a contact number. Customers can NEVER set the
    // delivery fee themselves — it starts pending and the Admin assigns it
    // later after checking the location. Any delivery_fee value the client
    // sends is deliberately ignored (never trusted from the browser).
    const isDelivery = order_type === 'delivery' || order_type === 'online';
    // The existing database CHECK constraint stores customer delivery orders
    // as `online`. Accept the clearer client value too, but normalize before
    // insertion so old deployments cannot fail with constraint 23514.
    const storedOrderType = order_type === 'delivery' ? 'online' : order_type;
    if (isDelivery) {
      if (!delivery_address || !String(delivery_address).trim()) {
        return res.status(400).json({ error: 'Please enter your delivery address.' });
      }
      if (!customer_phone || !String(customer_phone).trim()) {
        return res.status(400).json({ error: 'Please enter your contact number.' });
      }
    }

    const deliveryFee = 0;
    const deliveryFeeStatus = isDelivery ? 'pending' : null;
    let total_amount = 0;
    const validatedItems = [];

    // Re-price and validate menu items (without stock checks - those move inside transaction)
    for (const line of cart) {
      const menuQty = Number(line.quantity);
      if (!Number.isInteger(menuQty) || menuQty < 1) {
        return res.status(400).json({ error: 'Line quantities must be positive integers.' });
      }

      const { rows } = await client.query(
        'SELECT id, name, price, cost, stock_quantity, status FROM menu_items WHERE id = $1',
        [line.menu_id]
      );
      const menuItem = rows[0];

      if (!menuItem) {
        return res.status(400).json({ error: `Menu item ${line.menu_id} not found.` });
      }
      if (menuItem.status !== 'available') {
        return res.status(409).json({ error: `${menuItem.name} is currently unavailable.` });
      }

      // Check linked raw ingredients for this menu item (structure only, stock check moves to transaction)
      const { rows: itemComps } = await client.query(
        `SELECT mii.inventory_id, mii.quantity, mii.unit, ii.name AS inventory_name
         FROM menu_item_inventory mii
         JOIN inventory_items ii ON ii.id = mii.inventory_id
         WHERE mii.menu_id = $1`,
        [menuItem.id]
      );

      // Validate add-ons with the same rule the kitchen uses: an add-on with
      // NO product links is global; otherwise it must be linked to this item.
      const addons = [];
      if (Array.isArray(line.add_ons)) {
        for (const ad of line.add_ons) {
          const aQty = Number(ad.quantity);
          if (!Number.isInteger(aQty) || aQty < 1) {
            return res.status(400).json({ error: 'Add-on quantities must be positive integers.' });
          }

          const { rows: aRows } = await client.query(
            'SELECT id, name, price, cost, status FROM add_ons WHERE id = $1',
            [ad.addon_id]
          );
          const addon = aRows[0];
          if (!addon) {
            return res.status(400).json({ error: `Add-on ${ad.addon_id} not found.` });
          }
          if (addon.status === 'unavailable') {
            return res.status(409).json({ error: `${addon.name} is unavailable.` });
          }

          const { rows: anyLink } = await client.query(
            'SELECT 1 FROM addon_products WHERE addon_id = $1 LIMIT 1',
            [addon.id]
          );
          if (anyLink.length > 0) {
            const { rows: productLink } = await client.query(
              'SELECT 1 FROM addon_products WHERE addon_id = $1 AND menu_id = $2 LIMIT 1',
              [addon.id, menuItem.id]
            );
            if (productLink.length === 0) {
              return res.status(400).json({ error: `${addon.name} is not available for ${menuItem.name}.` });
            }
          }

          // Get add-on ingredient components (structure only, stock check moves to transaction)
          const { rows: comps } = await client.query(
            `SELECT ai.inventory_id, ai.quantity, ai.unit, ii.name AS inventory_name
             FROM addon_inventory ai
             JOIN inventory_items ii ON ii.id = ai.inventory_id
             WHERE ai.addon_id = $1`,
            [addon.id]
          );

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
        name: menuItem.name,
        quantity: menuQty,
        price: round2(menuItem.price),
        cost: round2(menuItem.cost || 0),
        notes: line.notes || null,
        inventory_components: itemComps,
        addons,
      });
      total_amount += menuItem.price * menuQty + addonsTotal;
    }

    total_amount = round2(total_amount + deliveryFee);

    await client.query('BEGIN');

    // Concurrency-safe stock check and deduction inside transaction
    // Lock all inventory rows that will be touched, then check and deduct atomically
    for (const item of validatedItems) {
      // Lock and check menu item ingredients
      for (const comp of item.inventory_components) {
        const needed = Number(comp.quantity) * item.quantity;
        const { rowCount } = await client.query(
          `UPDATE inventory_items 
           SET stock_quantity = stock_quantity - $1 
           WHERE id = $2 AND stock_quantity >= $1`,
          [needed, comp.inventory_id]
        );
        if (rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ 
            error: `${item.name} is out of stock (missing ingredient: ${comp.inventory_name}).` 
          });
        }
        // Log the deduction
        await client.query(
          `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, transaction_type, quantity_change, remarks)
           VALUES ($1, $2, NULL, 'sale', $3, $4)`,
          [comp.inventory_id, item.menu_id, -needed, `Online Order · ${item.name} (${comp.inventory_name})`]
        );
      }

      // Lock and check add-on ingredients
      for (const a of item.addons) {
        for (const comp of a.inventory_components) {
          const needed = Number(comp.quantity) * a.quantity;
          const { rowCount } = await client.query(
            `UPDATE inventory_items 
             SET stock_quantity = stock_quantity - $1 
             WHERE id = $2 AND stock_quantity >= $1`,
            [needed, comp.inventory_id]
          );
          if (rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ 
              error: `${a.name} is out of stock (missing ${comp.inventory_name}).` 
            });
          }
          await client.query(
            `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, transaction_type, quantity_change, remarks)
             VALUES ($1, $2, NULL, 'sale', $3, $4)`,
            [comp.inventory_id, item.menu_id, -needed, `Online Order · ${a.name} (${comp.inventory_name})`]
          );
        }
      }

      // Decrement menu item stock if tracking applies and item has no raw ingredients
      if (!item.inventory_components || item.inventory_components.length === 0) {
        const { rowCount } = await client.query(
          `UPDATE menu_items 
           SET stock_quantity = stock_quantity - $1 
           WHERE id = $2 AND stock_quantity IS NOT NULL AND stock_quantity >= $1`,
          [item.quantity, item.menu_id]
        );
        if (rowCount > 0) {
          await client.query(
            `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, transaction_type, quantity_change, remarks)
             VALUES (NULL, $1, NULL, 'sale', $2, $3)`,
            [item.menu_id, -item.quantity, `Online Order · ${item.name}`]
          );
        }
      }
    }

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, staff_id, reservation_id, order_type, status, total_amount, delivery_fee, delivery_address, notes, customer_name, customer_phone, payment_method, datetime_ordered)
       VALUES ($1, NULL, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING id, customer_id, reservation_id, order_type, status, total_amount, delivery_fee, delivery_address, notes, customer_name, customer_phone, payment_method, datetime_ordered`,
      [
        customer_id,
        reservation_id || null,
        storedOrderType,
        total_amount,
        deliveryFee,
        delivery_address || null,
        notes || null,
        customer_name || null,
        customer_phone || null,
        payment_method || null,
      ]
    );
    const order = orderResult.rows[0];

    for (const item of validatedItems) {
      const subtotal = round2(item.price * item.quantity);

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
          [orderItemId, a.id, a.name, a.quantity, a.price, a.cost, round2(a.price * a.quantity)]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ order });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}
const ORDER_ITEM_AGG = (orderRef) => `
  (SELECT COALESCE(json_agg(sub.*), '[]')
   FROM (
     SELECT oi.menu_id, mi.name AS item_name, oi.quantity, oi.price, oi.subtotal, oi.notes,
            COALESCE(
              json_agg(
                json_build_object(
                  'name', oia.name,
                  'quantity', oia.quantity,
                  'price', oia.price,
                  'subtotal', oia.subtotal
                )
              ) FILTER (WHERE oia.id IS NOT NULL),
              '[]'
            ) AS add_ons
     FROM order_items oi
     JOIN menu_items mi ON mi.id = oi.menu_id
     LEFT JOIN order_item_add_ons oia ON oia.order_item_id = oi.id
     WHERE oi.order_id = ${orderRef}
     GROUP BY oi.id, mi.name
   ) sub) AS items`;

const RESERVATION_FIELDS = 'r.reservation_id, r.reservation_status, r.reservation_date, r.reservation_time';

export async function getOrder(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, ${ORDER_ITEM_AGG('o.id')}
       FROM orders o
       WHERE o.id = $1`,
      [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Order not found.' });

    // Customers may only view their own orders.
    if (req.user?.customer?.id && rows[0].customer_id !== req.user.customer.id) {
      return res.status(403).json({ error: 'You don\'t have access to this order.' });
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
        error: 'No customer profile found for this account. Call /api/customer/auth/sync first.',
      });
    }

    const { rows } = await pool.query(
      `SELECT o.*, ${ORDER_ITEM_AGG('o.id')}
       FROM orders o
       WHERE o.customer_id = $1
       ORDER BY o.datetime_ordered DESC`,
      [customer_id]
    );

    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

// Lets a customer edit the details they typed in at checkout — but ONLY
// while the order is still pending. Once the restaurant confirms it, the
// details are locked and can only be viewed.
export async function updateOrder(req, res, next) {
  try {
    const customer_id = req.user?.customer?.id;
    const { id } = req.params;
    if (!customer_id) {
      return res.status(400).json({
        error: 'No customer profile found for this account. Call /api/customer/auth/sync first.',
      });
    }

    const { order_type, customer_name, customer_phone, delivery_address, payment_method, notes } = req.body;

    if (order_type !== undefined && !VALID_ORDER_TYPES.includes(order_type)) {
      return res.status(400).json({
        error: `order_type must be one of: ${VALID_ORDER_TYPES.join(', ')}`,
      });
    }
    if (payment_method !== undefined && !VALID_PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        error: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
      });
    }

    const fields = { order_type, customer_name, customer_phone, delivery_address, payment_method, notes };
    const cols = [];
    const vals = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val !== undefined) {
        cols.push(col);
        vals.push(val);
      }
    }
    if (cols.length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE orders
       SET ${setClause}
       WHERE id = $${cols.length + 1} AND customer_id = $${cols.length + 2} AND status = 'pending'
       RETURNING id, customer_id, reservation_id, order_type, status, total_amount, delivery_fee,
                 delivery_address, notes, customer_name, customer_phone, payment_method, datetime_ordered`,
      [...vals, id, customer_id]
    );

    if (!rows[0]) {
      // Distinguish "not found / not yours" from "already confirmed".
      const check = await pool.query(
        'SELECT status FROM orders WHERE id = $1 AND customer_id = $2',
        [id, customer_id]
      );
      if (!check.rows[0]) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      return res.status(409).json({
        error: `This order was already ${check.rows[0].status} and can no longer be edited.`,
      });
    }

    res.json({ order: rows[0] });
  } catch (err) {
    next(err);
  }
}

// Lets a customer cancel their own order, but ONLY while it is still pending.
// Both status update and inventory restoration happen in a single atomic transaction.
export async function cancelOrder(req, res, next) {
  try {
    const customer_id = req.user?.customer?.id;
    const { id } = req.params;
    if (!customer_id) {
      return res.status(400).json({
        error: 'No customer profile found for this account. Call /api/customer/auth/sync first.',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update order status and restore inventory in same transaction
      const { rows } = await client.query(
        `UPDATE orders
         SET status = 'cancelled', status_updated_at = NOW()
         WHERE id = $1 AND customer_id = $2 AND status = 'pending'
         RETURNING id, customer_id, reservation_id, order_type, status, total_amount, delivery_fee,
                   delivery_address, notes, customer_name, customer_phone, payment_method, datetime_ordered`,
        [id, customer_id]
      );

      if (!rows[0]) {
        await client.query('ROLLBACK');
        // Distinguish "not found / not yours" from "already decided".
        const check = await pool.query(
          'SELECT status FROM orders WHERE id = $1 AND customer_id = $2',
          [id, customer_id]
        );
        if (!check.rows[0]) {
          return res.status(404).json({ error: 'Order not found.' });
        }
        return res.status(409).json({
          error: `This order can't be cancelled because it is already ${check.rows[0].status}.`,
        });
      }

      await restoreOrderInventory(client, id, null);
      await client.query('COMMIT');

      res.json({ message: 'Order cancelled successfully.', order: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

export async function createPayment(req, res, next) {
  try {
    const customer_id = req.user?.customer?.id;
    if (!customer_id) {
      return res.status(400).json({ error: 'No customer profile found.' });
    }

    const { id: order_id } = req.params;
    const { payment_method, reference_number } = req.body;

    if (!VALID_PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        error: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
      });
    }

    const orderResult = await pool.query(
      'SELECT id, total_amount FROM orders WHERE id = $1 AND customer_id = $2',
      [order_id, customer_id]
    );
    const order = orderResult.rows[0];

    if (!order) return res.status(404).json({ error: 'Order not found.' });

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
    const customer_id = req.user?.customer?.id;
    if (!customer_id) {
      return res.status(400).json({ error: 'No customer profile found.' });
    }

    const { rows } = await pool.query(
      `SELECT p.* FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.order_id = $1 AND o.customer_id = $2`,
      [req.params.id, customer_id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'No payment found for this order.' });
    res.json({ payment: rows[0] });
  } catch (err) {
    next(err);
  }
}
