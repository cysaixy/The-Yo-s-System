// src/controllers/admin/purchasesController.js
import pool from '../../config/db.js';

let stockInColsReady = null;
async function ensureStockInColumns() {
  if (!stockInColsReady) {
    stockInColsReady = (async () => {
      await pool.query(`
        ALTER TABLE stock_in ADD COLUMN IF NOT EXISTS inventory_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL;
        ALTER TABLE stock_in ALTER COLUMN menu_id DROP NOT NULL;
        ALTER TABLE stock_in ADD COLUMN IF NOT EXISTS supplier VARCHAR(150);
        ALTER TABLE stock_in ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,4);
        ALTER TABLE stock_in ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10,2);
      `).catch(() => {});
    })().catch(err => {
      stockInColsReady = null;
      throw err;
    });
  }
  return stockInColsReady;
}

export async function list(req, res, next) {
  try {
    await ensureStockInColumns();

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
      // New schema with inventory_id and full metadata support
      query = `SELECT si.id, 
                      COALESCE(ii.name, mi.name) AS item_name,
                      ii.sku,
                      ii.category,
                      COALESCE(ii.unit, 'pcs') AS unit,
                      COALESCE(si.supplier, ii.supplier) AS supplier,
                      si.unit_cost,
                      si.total_cost,
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
                      NULL AS sku,
                      NULL AS category,
                      'pcs' AS unit,
                      NULL AS supplier,
                      NULL AS unit_cost,
                      NULL AS total_cost,
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
  await ensureStockInColumns();

  const client = await pool.connect();
  let inTransaction = false;
  try {
    const {
      inventory_id,
      menu_id,
      packs,
      quantity,
      expiration_date,
      remarks,
      supplier,
      unit_cost,
      price_per_pack,
      total_cost
    } = req.body || {};

    let actualQuantity;
    let computedRemarks = remarks ? String(remarks).trim() : null;
    let targetPackSize = null;

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
      targetPackSize = packSize;

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

    // Determine unit cost and total cost
    let computedUnitCost = null;
    if (unit_cost !== undefined && unit_cost !== null && unit_cost !== '') {
      const u = Number(unit_cost);
      if (Number.isFinite(u) && u >= 0) computedUnitCost = u;
    } else if (price_per_pack !== undefined && price_per_pack !== null && price_per_pack !== '' && targetPackSize > 0) {
      const p = Number(price_per_pack);
      if (Number.isFinite(p) && p >= 0) computedUnitCost = Math.round((p / targetPackSize) * 10000) / 10000;
    }

    let computedTotalCost = null;
    if (total_cost !== undefined && total_cost !== null && total_cost !== '') {
      const t = Number(total_cost);
      if (Number.isFinite(t) && t >= 0) computedTotalCost = t;
    } else if (computedUnitCost !== null && actualQuantity > 0) {
      computedTotalCost = Math.round(actualQuantity * computedUnitCost * 100) / 100;
    }

    const cleanedSupplier = supplier ? String(supplier).trim() : null;
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
      // New schema - support inventory_id, supplier, unit_cost, total_cost
      const { rows: stockInRows } = await client.query(
        `INSERT INTO stock_in (inventory_id, menu_id, staff_id, quantity, expiration_date, remarks, supplier, unit_cost, total_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, inventory_id, menu_id, quantity, expiration_date, stockin_date, supplier, unit_cost, total_cost`,
        [
          inventory_id || null,
          menu_id || null,
          staffId,
          actualQuantity,
          expiration_date || null,
          computedRemarks,
          cleanedSupplier,
          computedUnitCost,
          computedTotalCost
        ]
      );
      stockIn = stockInRows[0];

      // Update the appropriate stock table
      if (inventory_id) {
        // Also update supplier or unit_cost on inventory_items if provided
        await client.query(
          `UPDATE inventory_items 
           SET stock_quantity = stock_quantity + $1,
               supplier = COALESCE(NULLIF($3, ''), supplier),
               unit_cost = COALESCE($4, unit_cost)
           WHERE id = $2`,
          [actualQuantity, inventory_id, cleanedSupplier, computedUnitCost]
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