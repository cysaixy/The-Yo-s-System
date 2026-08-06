// src/controllers/admin/inventoryController.js
import pool from "../../config/db.js";

export async function overview(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, stock_quantity, status,
              CASE
                WHEN stock_quantity <= 0 THEN 'out_of_stock'
                WHEN stock_quantity < 5 THEN 'low_stock'
                WHEN stock_quantity < 15 THEN 'below_reorder'
                ELSE 'in_stock'
              END AS stock_status
       FROM menu_items
       ORDER BY stock_quantity ASC`
    );
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
}

export async function log(req, res, next) {
  try {
    const { menu_id, staff_id, transaction_type, from, to } = req.query;
    const conditions = [];
    const params = [];

    if (menu_id) { params.push(menu_id); conditions.push(`il.menu_id = $${params.length}`); }
    if (staff_id) { params.push(staff_id); conditions.push(`il.staff_id = $${params.length}`); }
    if (transaction_type) { params.push(transaction_type); conditions.push(`il.transaction_type = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`il.log_date::date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`il.log_date::date <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT il.id, mi.name AS item_name, s.name AS staff_name, il.transaction_type,
              il.quantity_change, il.log_date, il.remarks
       FROM inventory_log il
       JOIN menu_items mi ON mi.id = il.menu_id
       LEFT JOIN staff s ON s.id = il.staff_id
       ${where}
       ORDER BY il.log_date DESC`,
      params
    );

    res.json({ entries: rows });
  } catch (err) {
    next(err);
  }
}

export async function createAdjustment(req, res, next) {
  const client = await pool.connect();
  try {
    const { menu_id, quantity_change, remarks } = req.body || {};

    if (!menu_id || quantity_change === undefined) {
      return res.status(400).json({ error: "menu_id and quantity_change are required." });
    }

    const staffId = req.staff?.id || null;

    await client.query("BEGIN");

    const { rows: currentItem } = await client.query(
      `SELECT id, stock_quantity FROM menu_items WHERE id = $1`,
      [menu_id]
    );

    if (currentItem.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Menu item not found." });
    }

    const { rows: updated } = await client.query(
      `UPDATE menu_items SET stock_quantity = stock_quantity + $1
       WHERE id = $2 AND stock_quantity + $1 >= 0
       RETURNING id, stock_quantity`,
      [quantity_change, menu_id]
    );

    if (updated.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Adjustment would result in negative stock." });
    }

    const { rows: logRows } = await client.query(
      `INSERT INTO inventory_log (menu_id, staff_id, transaction_type, quantity_change, remarks)
       VALUES ($1, $2, 'adjustment', $3, $4)
       RETURNING id, menu_id, transaction_type, quantity_change, log_date`,
      [menu_id, staffId, quantity_change, remarks || null]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      adjustment: logRows[0],
      newStockQuantity: updated[0].stock_quantity,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}