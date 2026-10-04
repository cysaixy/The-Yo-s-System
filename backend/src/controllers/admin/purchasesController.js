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
  let inTransaction = false;
  try {
    const { inventory_id, menu_id, packs, quantity, expiration_date, remarks } = req.body || {};

    let actualQuantity;
    let computedRemarks = remarks ? String(remarks).trim() : null;

    if (packs !== undefined && packs !== null && String(packs).trim() !== '') {
      // Path: compute quantity from packs and pack_size
      if (!inventory_id) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'inventory_id is required when specifying packs.',
        });
      }

      const numPacks = Number(packs);
      if (!Number.isFinite(numPacks) || numPacks <= 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Packs must be a positive number.',
        });
      }

      // Get the item to find pack_size and unit
      const { rows: itemRows } = await client.query(
        'SELECT id, name, unit, pack_size FROM inventory_items WHERE id = $1',
        [inventory_id]
      );

      if (!itemRows.length) {
        return res.status(404).json({ error: 'Inventory item not found.' });
      }

      const packSize = itemRows[0].pack_size !== null ? Number(itemRows[0].pack_size) : null;

      if (packSize === null || !Number.isFinite(packSize) || packSize <= 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'This item has no pack size set. Enter total quantity instead.',
        });
      }

      // Round computed quantity to 2 decimals
      actualQuantity = Math.round(numPacks * packSize * 100) / 100;

      const unitLabel = itemRows[0].unit || 'pcs';
      const packDetail = `${numPacks} pack(s) x ${packSize} ${unitLabel}`;
      computedRemarks = computedRemarks ? `${computedRemarks} (${packDetail})` : packDetail;
    } else if (quantity !== undefined && quantity !== null && String(quantity).trim() !== '') {
      // Path: use quantity directly
      if (!inventory_id && !menu_id) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Either inventory_id or menu_id, and a positive quantity are required.',
        });
      }

      const numQuantity = Number(quantity);
      if (!Number.isFinite(numQuantity) || numQuantity <= 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Quantity must be a positive number.',
        });
      }

      // Finished products (menu_items) stock column is integer
      if (menu_id) {
        if (!Number.isInteger(numQuantity)) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Finished product quantity must be a whole number.',
          });
        }
      }

      actualQuantity = Math.round(numQuantity * 100) / 100;
    } else {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Either packs or quantity is required.',
      });
    }

    const staffId = req.staff?.id || null;

    // Check if inventory_id column exists
    const { rows: columnCheck } = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'stock_in' AND column_name = 'inventory_id'
    `);
    const hasInventoryId = columnCheck.length > 0;

    if (!hasInventoryId && inventory_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Database migration required to support raw ingredient purchases. Please run the migration.',
      });
    }

    await client.query('BEGIN');
    inTransaction = true;

    let stockIn;
    if (hasInventoryId) {
      // New schema - support both inventory_id and menu_id
      const { rows: stockInRows } = await client.query(
        `INSERT INTO stock_in (inventory_id, menu_id, staff_id, quantity, expiration_date, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, inventory_id, menu_id, quantity, expiration_date, stockin_date`,
        [inventory_id || null, menu_id || null, staffId, actualQuantity, expiration_date || null, computedRemarks]
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
      const { rows: stockInRows } = await client.query(
        `INSERT INTO stock_in (menu_id, staff_id, quantity, expiration_date, remarks)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, menu_id, quantity, expiration_date, stockin_date`,
        [menu_id, staffId, actualQuantity, expiration_date || null, computedRemarks]
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
      [inventory_id || null, menu_id || null, staffId, stockIn.id, actualQuantity, computedRemarks]
    );

    await client.query('COMMIT');
    inTransaction = false;
    return res.status(201).json(stockIn);
  } catch (err) {
    if (inTransaction) {
      await client.query('ROLLBACK');
    }
    next(err);
  } finally {
    client.release();
  }
}