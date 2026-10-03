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

    // Check if inventory_id column exists (backward compatibility)
    const { rows: columnCheck } = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'stock_in' AND column_name = 'inventory_id'
    `);
    
    const hasInventoryId = columnCheck.length > 0;

    let query;
    if (hasInventoryId) {
      // New schema with inventory_id support
      query = `SELECT si.id, 
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
               ORDER BY si.stockin_date DESC`;
    } else {
      // Legacy schema without inventory_id
      query = `SELECT si.id, 
                      mi.name AS item_name,
                      'pcs' AS unit,
                      s.name AS staff_name, 
                      si.quantity,
                      si.expiration_date, si.stockin_date, si.remarks
               FROM stock_in si
               JOIN menu_items mi ON mi.id = si.menu_id
               LEFT JOIN staff s ON s.id = si.staff_id
               ${where}
               ORDER BY si.stockin_date DESC`;
    }

    const { rows } = await pool.query(query, params);

    return res.json({ purchases: rows });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  const client = await pool.connect();
  try {
    const { inventory_id, menu_id, packs, quantity, expiration_date, remarks } = req.body || {};

    // Determine the actual quantity: if pack_size is set, quantity = packs * pack_size
    // Otherwise use quantity directly (legacy behavior)
    let actualQuantity;
    let quantityToStore;

    if (packs !== undefined && packs !== null) {
      // New path: compute quantity from packs and pack_size
      if (!inventory_id) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'inventory_id is required when specifying packs.',
        });
      }
      
      // Get the item to find pack_size
      const { rows: itemRows } = await client.query(
        'SELECT id, pack_size FROM inventory_items WHERE id = $1',
        [inventory_id]
      );
      
      if (!itemRows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Inventory item not found.' });
      }

      const packSize = itemRows[0].pack_size;
      
      if (packSize === null) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Bad Request',
          message: 'This item has no pack size set. Enter total quantity instead.',
        });
      }

      if (!Number.isFinite(packs) || packs <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Packs must be a positive number.',
        });
      }

      actualQuantity = Number(packs) * Number(packSize);
      quantityToStore = actualQuantity;
    } else if (quantity !== undefined && quantity !== null) {
      // Legacy path: use quantity directly
      if ((!inventory_id && !menu_id) || quantity <= 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Either inventory_id or menu_id, and a positive quantity are required.',
        });
      }

      actualQuantity = Number(quantity);
      quantityToStore = actualQuantity;
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Either packs or quantity are required.',
      });
    }

    const staffId = req.staff?.id || null;

    await client.query('BEGIN');

    // Check if inventory_id column exists
    const { rows: columnCheck } = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'stock_in' AND column_name = 'inventory_id'
    `);
    const hasInventoryId = columnCheck.length > 0;

    let stockIn;
    if (hasInventoryId) {
      // New schema - support both inventory_id and menu_id
      const { rows: stockInRows } = await client.query(
        `INSERT INTO stock_in (inventory_id, menu_id, staff_id, quantity, expiration_date, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, inventory_id, menu_id, quantity, expiration_date, stockin_date`,
        [inventory_id || null, menu_id || null, staffId, quantityToStore, expiration_date || null, remarks || null]
      );
      stockIn = stockInRows[0];

      // Update the appropriate stock table
      if (inventory_id) {
        await client.query(
          'UPDATE inventory_items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
          [actualQuantity, inventory_id]
        );
      } else if (menu_id) {
        await client.query(
          'UPDATE menu_items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
          [actualQuantity, menu_id]
        );
      }
    } else {
      // Legacy schema - only menu_id supported
      if (inventory_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Database migration required to support raw ingredient purchases. Please run the migration.',
        });
      }

      const { rows: stockInRows } = await client.query(
        `INSERT INTO stock_in (menu_id, staff_id, quantity, expiration_date, remarks)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, menu_id, quantity, expiration_date, stockin_date`,
        [menu_id, staffId, quantityToStore, expiration_date || null, remarks || null]
      );
      stockIn = stockInRows[0];

      await client.query(
        'UPDATE menu_items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [actualQuantity, menu_id]
      );
    }

    await client.query(
      `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, stock_in_id, transaction_type, quantity_change, remarks)
       VALUES ($1, $2, $3, $4, 'stock_in', $5, $6)`,
      [inventory_id || null, menu_id || null, staffId, stockIn.id, actualQuantity, remarks || null]
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