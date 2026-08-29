// src/controllers/admin/reservationOrderController.js
import pool from "../../config/db.js";

const VALID_ORDER_STATUSES = ['no_order', 'editable', 'finalized', 'locked'];
const VALID_RESERVATION_STATUSES = ['pending', 'contact_customer', 'order_preparing', 'order_finalized', 'confirmed', 'cancelled', 'completed'];

// Get order details for a reservation
export async function getReservationOrder(req, res, next) {
  try {
    const { id } = req.params;

    const resv = await pool.query(
      `SELECT reservations.*, customers.name AS customer_name, customers.email AS customer_email, customers.phone AS customer_phone
       FROM reservations
       JOIN customers ON customers.id = reservations.customer_id
       WHERE reservations.id = $1`,
      [id]
    );

    if (!resv.rows[0]) {
      return res.status(404).json({ error: "Reservation not found." });
    }

    const reservation = resv.rows[0];

    // Get order if exists
    const orderRes = await pool.query(
      `SELECT * FROM orders WHERE reservation_id = $1`,
      [id]
    );

    let order = orderRes.rows[0] || null;
    let orderItems = [];

    if (order) {
      const itemsRes = await pool.query(
        `SELECT order_items.*, menu_items.name, menu_items.category_id
         FROM order_items
         JOIN menu_items ON menu_items.id = order_items.menu_id
         WHERE order_items.order_id = $1`,
        [order.id]
      );
      orderItems = itemsRes.rows;

      // Get add-ons for each item
      for (const item of orderItems) {
        const addonsRes = await pool.query(
          `SELECT * FROM order_item_add_ons WHERE order_item_id = $1`,
          [item.id]
        );
        item.add_ons = addonsRes.rows;
      }
    }

    // Calculate order editing deadline status
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = reservation.order_editing_deadline ? new Date(reservation.order_editing_deadline) : null;
    const isLocked = deadline && today > deadline;
    const orderStatus = reservation.order_status || 'no_order';

    res.json({
      reservation: {
        id: reservation.id,
        customer_name: reservation.customer_name,
        customer_email: reservation.customer_email,
        customer_phone: reservation.customer_phone,
        reservation_date: reservation.reservation_date,
        reservation_time: reservation.reservation_time,
        guests: reservation.guests,
        status: reservation.status,
        notes: reservation.notes,
        datetime_reserved: reservation.datetime_reserved,
        order_status: reservation.order_status,
        order_editing_deadline: reservation.order_editing_deadline,
        reservation_status: reservation.reservation_status,
        table_no: reservation.table_no,
        is_order_locked: isLocked && orderStatus !== 'locked',
      },
      order: order ? {
        id: order.id,
        status: order.status,
        total_amount: order.total_amount,
        notes: order.notes,
        datetime_ordered: order.datetime_ordered,
        items: orderItems,
      } : null,
      menu_items: await getAvailableMenuItems(),
    });
  } catch (err) {
    next(err);
  }
}

// Get available menu items for order creation
async function getAvailableMenuItems() {
  const { rows } = await pool.query(
    `SELECT menu_items.id, menu_items.name, menu_items.price, menu_items.description, menu_items.category_id, menu_items.image_url, categories.name AS category_name
     FROM menu_items
     JOIN categories ON categories.id = menu_items.category_id
     WHERE menu_items.status = 'available'
     ORDER BY categories.name, menu_items.name`
  );
  return rows;
}

// Create or update order for a reservation
export async function upsertReservationOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { items, notes, status, custom_order_notes } = req.body;
    const staff_id = req.user?.staff?.id;

    // Check reservation exists
    const resv = await pool.query(
      `SELECT * FROM reservations WHERE id = $1`,
      [id]
    );

    if (!resv.rows[0]) {
      return res.status(404).json({ error: "Reservation not found." });
    }

    const reservation = resv.rows[0];

    // Check if order editing is allowed (unless admin override)
    const { admin_override } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = reservation.order_editing_deadline ? new Date(reservation.order_editing_deadline) : null;
    const isLocked = deadline && today > deadline;

    if (isLocked && reservation.order_status === 'locked' && !admin_override) {
      return res.status(403).json({
        error: "This order can no longer be edited because the order modification deadline has passed.",
        order_locked: true,
        deadline: reservation.order_editing_deadline,
      });
    }

    // Check if admin_override is used by authorized admin
    if (admin_override && req.user?.staff?.role !== 'Admin') {
      return res.status(403).json({
        error: "Only administrators can override the order editing deadline.",
      });
    }

    // Validate order status transition (for reservation's order_status)
    const currentOrderStatus = reservation.order_status || 'no_order';
    const newOrderStatus = status || (currentOrderStatus === 'no_order' ? 'editable' : currentOrderStatus);

    if (!VALID_ORDER_STATUSES.includes(newOrderStatus)) {
      return res.status(400).json({ error: `Invalid order status. Must be one of: ${VALID_ORDER_STATUSES.join(', ')}` });
    }

    // Can't go back from locked unless admin override
    if (currentOrderStatus === 'locked' && newOrderStatus !== 'locked' && !admin_override) {
      return res.status(400).json({ error: "Cannot change status from locked without admin override." });
    }

    // Orders table uses different status values - default to 'pending' for new orders
    const orderStatus = 'pending';

    // Can't go back from finalized to editable without good reason (but allow for now)
    // This is a business rule - we'll allow staff to move between editable and finalized

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get or create order
      let orderRes = await client.query(
        `SELECT * FROM orders WHERE reservation_id = $1`,
        [id]
      );

      // Combine custom order notes with existing notes
      const combinedNotes = [notes, custom_order_notes].filter(Boolean).join('\n\n--- CUSTOM ORDER (from call) ---\n');

      let order;
      if (orderRes.rows[0]) {
        order = orderRes.rows[0];
        // Update order - keep existing order status, only update notes
        const updateRes = await client.query(
          `UPDATE orders SET notes = $1 WHERE id = $2 RETURNING *`,
          [combinedNotes || order.notes, order.id]
        );
        order = updateRes.rows[0];

        // Delete existing order items and add-ons (we'll recreate)
        await client.query(
          `DELETE FROM order_item_add_ons WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = $1)`,
          [order.id]
        );
        await client.query(`DELETE FROM order_items WHERE order_id = $1`, [order.id]);
      } else {
        // Create new order
        const createRes = await client.query(
          `INSERT INTO orders (customer_id, staff_id, reservation_id, order_type, status, total_amount, datetime_ordered, notes)
           VALUES ($1, $2, $3, 'dine_in', $4, 0, NOW(), $5)
           RETURNING *`,
          [reservation.customer_id, staff_id, id, orderStatus, combinedNotes || null]
        );
        order = createRes.rows[0];
      }

      // Add order items
      let totalAmount = 0;
      if (items && items.length > 0) {
        for (const item of items) {
          const menuRes = await client.query(
            `SELECT id, name, price, cost FROM menu_items WHERE id = $1 AND status = 'available'`,
            [item.menu_id]
          );
          if (!menuRes.rows[0]) continue;

          const menuItem = menuRes.rows[0];
          const quantity = Math.max(1, Number(item.quantity) || 1);
          const price = Number(menuItem.price);
          const subtotal = price * quantity;

          const itemRes = await client.query(
            `INSERT INTO order_items (order_id, menu_id, quantity, price, subtotal, notes, cost)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [order.id, menuItem.id, quantity, price, subtotal, item.notes || null, menuItem.cost || 0]
          );

          const orderItem = itemRes.rows[0];
          totalAmount += subtotal;

          // Add add-ons if provided
          if (item.add_ons && item.add_ons.length > 0) {
            for (const addon of item.add_ons) {
              const addonRes = await client.query(
                `SELECT id, name, price, cost FROM add_ons WHERE id = $1 AND status = 'available'`,
                [addon.addon_id]
              );
              if (!addonRes.rows[0]) continue;

              const addonItem = addonRes.rows[0];
              const addonQty = Math.max(1, Number(addon.quantity) || 1);
              const addonSubtotal = Number(addonItem.price) * addonQty;

              await client.query(
                `INSERT INTO order_item_add_ons (order_item_id, addon_id, name, quantity, price, cost, subtotal)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [orderItem.id, addonItem.id, addonItem.name, addonQty, addonItem.price, addonItem.cost || 0, addonSubtotal]
              );

              totalAmount += addonSubtotal;
            }
          }
        }
      }

      // Update order total
      await client.query(
        `UPDATE orders SET total_amount = $1 WHERE id = $2`,
        [totalAmount, order.id]
      );

      // Update reservation order_status and reservation_status
      let newReservationStatus = reservation.reservation_status;
      if (newOrderStatus === 'editable' && newReservationStatus === 'pending') {
        newReservationStatus = 'order_preparing';
      } else if (newOrderStatus === 'finalized' && newReservationStatus === 'order_preparing') {
        newReservationStatus = 'order_finalized';
      }

      await client.query(
        `UPDATE reservations SET order_status = $1, reservation_status = $2 WHERE id = $3`,
        [newOrderStatus, newReservationStatus, id]
      );

      await client.query('COMMIT');

      // Fetch updated order with items
      const updatedOrderRes = await pool.query(
        `SELECT * FROM orders WHERE id = $1`,
        [order.id]
      );

      const itemsRes = await pool.query(
        `SELECT order_items.*, menu_items.name, menu_items.category_id
         FROM order_items
         JOIN menu_items ON menu_items.id = order_items.menu_id
         WHERE order_items.order_id = $1`,
        [order.id]
      );

      const orderItems = itemsRes.rows;
      for (const item of orderItems) {
        const addonsRes = await pool.query(
          `SELECT * FROM order_item_add_ons WHERE order_item_id = $1`,
          [item.id]
        );
        item.add_ons = addonsRes.rows;
      }

      res.json({
        order: {
          id: updatedOrderRes.rows[0].id,
          status: updatedOrderRes.rows[0].status,
          total_amount: updatedOrderRes.rows[0].total_amount,
          notes: updatedOrderRes.rows[0].notes,
          datetime_ordered: updatedOrderRes.rows[0].datetime_ordered,
          items: orderItems,
        },
        reservation: {
          order_status: newOrderStatus,
          reservation_status: newReservationStatus,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

// Update reservation status (contact customer, etc.)
export async function updateReservationStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { reservation_status, contact_notes } = req.body;

    if (!VALID_RESERVATION_STATUSES.includes(reservation_status)) {
      return res.status(400).json({ error: `Invalid reservation status.` });
    }

    const resv = await pool.query(
      `SELECT * FROM reservations WHERE id = $1`,
      [id]
    );

    if (!resv.rows[0]) {
      return res.status(404).json({ error: "Reservation not found." });
    }

    const reservation = resv.rows[0];
    const updates = { reservation_status };
    const setClauses = ['reservation_status = $1'];
    const params = [reservation_status];
    let paramIndex = 2;

    // Track contact attempt
    if (reservation_status === 'contact_customer' && !reservation.contact_attempted_at) {
      setClauses.push(`contact_attempted_at = $${paramIndex}`);
      params.push(new Date());
      paramIndex++;
    }

    // Track order finalization
    if (reservation_status === 'order_finalized' && !reservation.order_finalized_at) {
      setClauses.push(`order_finalized_at = $${paramIndex}`);
      params.push(new Date());
      paramIndex++;
    }

    // Track confirmation
    if (reservation_status === 'confirmed' && !reservation.confirmed_at) {
      setClauses.push(`confirmed_at = $${paramIndex}`);
      params.push(new Date());
      paramIndex++;
    }

    params.push(id);
    const query = `UPDATE reservations SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const { rows } = await pool.query(query, params);

    res.json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}

// Admin confirm reservation (with order requirement check)
export async function adminConfirmReservation(req, res, next) {
  try {
    const { id } = req.params;
    const { table_no } = req.body;

    const resv = await pool.query(
      `SELECT reservations.*, customers.name AS customer_name FROM reservations
       JOIN customers ON customers.id = reservations.customer_id WHERE reservations.id = $1`,
      [id]
    );

    if (!resv.rows[0]) return res.status(404).json({ error: "Reservation not found." });
    const reservation = resv.rows[0];

    // Check if order exists and is finalized
    const orderRes = await pool.query(
      `SELECT * FROM orders WHERE reservation_id = $1`,
      [id]
    );

    if (!orderRes.rows[0]) {
      return res.status(400).json({
        error: "Please record and finalize the customer's order before confirming this reservation."
      });
    }

    if (reservation.order_status !== 'finalized') {
      return res.status(400).json({
        error: "Order must be finalized before confirming the reservation."
      });
    }

    if (!table_no) {
      return res.status(400).json({
        error: "Assign a table before confirming - a confirmed reservation needs a seat."
      });
    }

    // Check table
    const tableRes = await pool.query(
      `SELECT id, table_no, capacity, status FROM tables WHERE table_no = $1`,
      [String(table_no).trim()]
    );
    if (!tableRes.rows[0]) {
      return res.status(400).json({ error: `Table "${table_no}" doesn't exist.` });
    }
    const table = tableRes.rows[0];
    if (table.status !== "active") {
      return res.status(400).json({ error: `Table ${table.table_no} is currently unavailable.` });
    }
    if (table.capacity < reservation.guests) {
      return res.status(400).json({
        error: `${table.table_no} seats ${table.capacity} but this reservation is for ${reservation.guests} guests. Pick a bigger table.`
      });
    }

    // Check conflicts
    const CONFLICT_WINDOW_MINUTES = 120;
    const conflict = await pool.query(
      `SELECT reservations.id, reservations.table_no, reservations.reservation_time, reservations.guests
       FROM reservations
       WHERE reservations.table_no = $1
         AND reservations.reservation_date = $2
         AND reservations.status = 'confirmed'
         AND reservations.id <> $3
         AND ABS(EXTRACT(EPOCH FROM (reservations.reservation_time - $4::time))) / 60 < $5`,
      [table.table_no, reservation.reservation_date, reservation.id, reservation.reservation_time, CONFLICT_WINDOW_MINUTES]
    );
    if (conflict.rows[0]) {
      const other = conflict.rows[0];
      return res.status(409).json({
        error: `${table.table_no} is already reserved that day at ${String(other.reservation_time).slice(0, 5)} (${other.guests} guests). Pick a different table or time.`
      });
    }

    // Update reservation
    const { rows } = await pool.query(
      `UPDATE reservations
       SET status = 'confirmed', table_no = $1, reservation_status = 'confirmed', confirmed_at = NOW()
       WHERE id = $2
       RETURNING id, status, table_no, reservation_status`,
      [table.table_no, reservation.id]
    );

    // Also update order status to confirmed
    await pool.query(
      `UPDATE orders SET status = 'confirmed' WHERE reservation_id = $1`,
      [id]
    );

    res.json({ reservation: rows[0] });
  } catch (err) {
    next(err);
  }
}

// Check if order can be edited (for frontend)
export async function checkOrderEditPermission(req, res, next) {
  try {
    const { id } = req.params;
    const { admin_override } = req.query;

    const resv = await pool.query(
      `SELECT * FROM reservations WHERE id = $1`,
      [id]
    );

    if (!resv.rows[0]) {
      return res.status(404).json({ error: "Reservation not found." });
    }

    const reservation = resv.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = reservation.order_editing_deadline ? new Date(reservation.order_editing_deadline) : null;
    const isPastDeadline = deadline && today > deadline;
    const isLocked = isPastDeadline && reservation.order_status !== 'locked';

    // Auto-lock if past deadline
    if (isLocked) {
      await pool.query(
        `UPDATE reservations SET order_status = 'locked' WHERE id = $1 AND order_status = 'editable'`,
        [id]
      );
      reservation.order_status = 'locked';
    }

    const canEdit = (reservation.order_status === 'editable' || reservation.order_status === 'finalized') && !isPastDeadline;
    const canEditWithOverride = canEdit || (admin_override === 'true' && req.user?.staff?.role === 'Admin');

    res.json({
      can_edit: canEdit,
      can_edit_with_override: canEditWithOverride,
      is_locked: isPastDeadline,
      order_status: reservation.order_status,
      order_editing_deadline: reservation.order_editing_deadline,
      requires_admin_override: isPastDeadline && reservation.order_status === 'locked',
    });
  } catch (err) {
    next(err);
  }
}