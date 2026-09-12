// src/controllers/admin/purchasesController.js
import pool from '../../config/db.js';

export async function list(req, res, next) {
  try {
    const { from, to } = req.query;
    const conditions = [];
    const params = [];

    if (from) { params.push(from); conditions.push(`si.stockin_date::date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`si.stockin_date::date <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT si.id, 
              COALESCE(ii.name, mi.name) AS item_name,
              COALESCE(ii.unit, 'pcs') AS unit,
              s.name AS staff_name, 
              si.quantity,
              si.expiration_date, si.stockin_date, si.remarks
       FROM stock_in si
       LEFT JOIN inventory_items ii ON ii.id = si.inventory_id
       LEFT JOIN menu_items mi ON mi.id = si.menu_id
       LEFT JOIN staff s ON s.id = si.staff_id
       ${where}
       ORDER BY si.stockin_date DESC`,
      params
    );

    return res.json({ purchases: rows });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  const client = await pool.connect();
  try {
    const { inventory_id, menu_id, quantity, expiration_date, remarks } = req.body || {};

    // Support both raw ingredients (inventory_id) and legacy direct products (menu_id)
    if ((!inventory_id && !menu_id) || !quantity || quantity <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Either inventory_id or menu_id, and a positive quantity are required.',
      });
    }

    const staffId = req.staff?.id || null;

    await client.query('BEGIN');

    const { rows: stockInRows } = await client.query(
      `INSERT INTO stock_in (inventory_id, menu_id, staff_id, quantity, expiration_date, remarks)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, inventory_id, menu_id, quantity, expiration_date, stockin_date`,
      [inventory_id || null, menu_id || null, staffId, Number(quantity), expiration_date || null, remarks || null]
    );
    const stockIn = stockInRows[0];

    // Update the appropriate stock table
    if (inventory_id) {
      // Raw ingredient purchase - update inventory_items
      await client.query(
        'UPDATE inventory_items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [Number(quantity), inventory_id]
      );
    } else if (menu_id) {
      // Direct product purchase (legacy path) - update menu_items
      await client.query(
        'UPDATE menu_items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [Number(quantity), menu_id]
      );
    }

    await client.query(
      `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, stock_in_id, transaction_type, quantity_change, remarks)
       VALUES ($1, $2, $3, $4, 'stock_in', $5, $6)`,
      [inventory_id || null, menu_id || null, staffId, stockIn.id, Number(quantity), remarks || null]
    );

    await client.query('COMMIT');
    return res.status(201).json(stockIn);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}