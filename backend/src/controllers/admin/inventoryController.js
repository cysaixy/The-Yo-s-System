// src/controllers/admin/inventoryController.js
import pool from "../../config/db.js";

// GET /api/admin/inventory
export async function overview(req, res, next) {
  try {
    let { rows } = await pool.query(
      `SELECT id, name, category, sku, stock_quantity, unit, unit_cost, reorder_level, supplier, notes,
              CASE
                WHEN stock_quantity <= 0 THEN 'out_of_stock'
                WHEN stock_quantity <= reorder_level THEN 'below_reorder'
                WHEN stock_quantity <= (reorder_level * 1.5) THEN 'low_stock'
                ELSE 'in_stock'
              END AS stock_status
       FROM inventory_items
       ORDER BY name ASC`
    );

    // If inventory_items is currently empty, seed standard cafe inventory items
    if (rows.length === 0) {
      await pool.query(`
        INSERT INTO inventory_items (name, category, sku, stock_quantity, unit, unit_cost, reorder_level, supplier, status, notes)
        VALUES
        ('Espresso Beans', 'Coffee & Espresso', 'COF-001', 15.00, 'kg', 850.00, 3.00, 'ABC Coffee Supplier', 'in_stock', 'Premium Arabica espresso beans'),
        ('Fresh Milk', 'Milk & Dairy', 'MLK-001', 24.00, 'L', 95.00, 5.00, 'Dairy Fresh Co.', 'in_stock', 'Whole fresh milk'),
        ('Oat Milk', 'Non-Dairy & Plant-Based', 'MLK-002', 12.00, 'L', 150.00, 4.00, 'OatLy Inc.', 'in_stock', 'Barista edition oat milk'),
        ('Matcha Powder', 'Tea & Matcha', 'TEA-001', 2.50, 'kg', 1200.00, 1.00, 'Uji Tea Imports', 'in_stock', 'Ceremonial grade matcha'),
        ('Vanilla Syrup', 'Syrups & Flavorings', 'SYR-001', 8.00, 'bottle', 380.00, 2.00, 'Monin Philippines', 'in_stock', '750ml vanilla syrup'),
        ('Caramel Sauce', 'Sauces & Toppings', 'SAU-001', 5.00, 'bottle', 420.00, 2.00, 'Torani Sauces', 'in_stock', 'Drizzle sauce'),
        ('Brown Sugar', 'Sweeteners', 'SWT-001', 20.00, 'kg', 65.00, 5.00, 'Local Sugar Mill', 'in_stock', 'Raw brown sugar'),
        ('Paper Cups 16oz', 'Packaging', 'PKG-001', 500.00, 'pcs', 4.50, 100.00, 'EcoPack Corp', 'in_stock', 'Double wall hot cups'),
        ('Plastic Lids', 'Packaging', 'PKG-002', 450.00, 'pcs', 1.80, 100.00, 'EcoPack Corp', 'in_stock', 'Sip lids for 16oz')
      `);

      const seeded = await pool.query(
        `SELECT id, name, category, sku, stock_quantity, unit, unit_cost, reorder_level, supplier, notes,
                CASE
                  WHEN stock_quantity <= 0 THEN 'out_of_stock'
                  WHEN stock_quantity <= reorder_level THEN 'below_reorder'
                  WHEN stock_quantity <= (reorder_level * 1.5) THEN 'low_stock'
                  ELSE 'in_stock'
                END AS stock_status
         FROM inventory_items
         ORDER BY name ASC`
      );
      rows = seeded.rows;
    }
    
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/inventory/items
export async function createItem(req, res, next) {
  try {
    const {
      name, category, sku, stock_quantity, unit, unit_cost, reorder_level, supplier, notes
    } = req.body || {};

    if (!name || !category) {
      return res.status(400).json({ error: "Item name and category are required." });
    }

    const stock = Number(stock_quantity || 0);
    const cost = Number(unit_cost || 0);
    const reorder = Number(reorder_level || 5);

    let status = 'in_stock';
    if (stock <= 0) status = 'out_of_stock';
    else if (stock <= reorder) status = 'below_reorder';
    else if (stock <= reorder * 1.5) status = 'low_stock';

    const { rows } = await pool.query(
      `INSERT INTO inventory_items (name, category, sku, stock_quantity, unit, unit_cost, reorder_level, supplier, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, category, sku || null, stock, unit || 'pcs', cost, reorder, supplier || null, status, notes || null]
    );

    res.status(201).json({ item: rows[0] });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/inventory/items/:id
export async function updateItem(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name, category, sku, stock_quantity, unit, unit_cost, reorder_level, supplier, notes
    } = req.body || {};

    const existingRes = await pool.query(`SELECT * FROM inventory_items WHERE id = $1`, [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: "Inventory item not found." });
    }
    const current = existingRes.rows[0];

    const newStock = stock_quantity !== undefined ? Number(stock_quantity) : Number(current.stock_quantity);
    const newReorder = reorder_level !== undefined ? Number(reorder_level) : Number(current.reorder_level);

    let status = 'in_stock';
    if (newStock <= 0) status = 'out_of_stock';
    else if (newStock <= newReorder) status = 'below_reorder';
    else if (newStock <= newReorder * 1.5) status = 'low_stock';

    const { rows } = await pool.query(
      `UPDATE inventory_items
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           sku = COALESCE($3, sku),
           stock_quantity = $4,
           unit = COALESCE($5, unit),
           unit_cost = COALESCE($6, unit_cost),
           reorder_level = $7,
           supplier = COALESCE($8, supplier),
           status = $9,
           notes = COALESCE($10, notes)
       WHERE id = $11
       RETURNING *`,
      [name, category, sku, newStock, unit, unit_cost, newReorder, supplier, status, notes, id]
    );

    res.json({ item: rows[0] });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/inventory/items/:id
export async function deleteItem(req, res, next) {
  try {
    const { id } = req.params;

    // Check if linked to any products or add-ons
    const linkedProducts = await pool.query(
      `SELECT m.name FROM menu_items m JOIN menu_item_inventory mii ON mii.menu_id = m.id WHERE mii.inventory_id = $1`,
      [id]
    );
    const linkedAddons = await pool.query(
      `SELECT a.name FROM add_ons a JOIN addon_inventory ai ON ai.addon_id = a.id WHERE ai.inventory_id = $1`,
      [id]
    );

    if (linkedProducts.rows.length > 0 || linkedAddons.rows.length > 0) {
      const parts = [];
      if (linkedProducts.rows.length > 0) parts.push(`products (${linkedProducts.rows.map(r => r.name).join(", ")})`);
      if (linkedAddons.rows.length > 0) parts.push(`add-ons (${linkedAddons.rows.map(r => r.name).join(", ")})`);
      return res.status(409).json({
        error: `This inventory item is currently linked to ${parts.join(" and ")}. Please remove the linkage first or deactivate the item.`,
        linkedProducts: linkedProducts.rows,
        linkedAddons: linkedAddons.rows
      });
    }

    const { rowCount } = await pool.query(`DELETE FROM inventory_items WHERE id = $1`, [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Inventory item not found." });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/inventory/adjustments
export async function createAdjustment(req, res, next) {
  const client = await pool.connect();
  try {
    const { inventory_id, menu_id, quantity_change, remarks } = req.body || {};
    const targetId = inventory_id || menu_id;

    if (!targetId || quantity_change === undefined) {
      return res.status(400).json({ error: "Item ID and quantity_change are required." });
    }

    const staffId = req.staff?.id || null;
    await client.query("BEGIN");

    // Try inventory_items first
    const { rows: invRows } = await client.query(
      `SELECT id, name, stock_quantity, reorder_level FROM inventory_items WHERE id = $1`,
      [targetId]
    );

    let updatedItem = null;

    if (invRows.length > 0) {
      const item = invRows[0];
      const newStock = Number(item.stock_quantity) + Number(quantity_change);
      if (newStock < 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Adjustment would result in negative stock." });
      }

      let status = 'in_stock';
      if (newStock <= 0) status = 'out_of_stock';
      else if (newStock <= item.reorder_level) status = 'below_reorder';
      else if (newStock <= item.reorder_level * 1.5) status = 'low_stock';

      const { rows: upd } = await client.query(
        `UPDATE inventory_items SET stock_quantity = $1, status = $2 WHERE id = $3 RETURNING *`,
        [newStock, status, targetId]
      );
      updatedItem = upd[0];
    } else {
      // Fallback to menu_items
      const { rows: upd } = await client.query(
        `UPDATE menu_items SET stock_quantity = stock_quantity + $1
         WHERE id = $2 AND stock_quantity + $1 >= 0
         RETURNING id, stock_quantity`,
        [quantity_change, targetId]
      );
      if (upd.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Item not found or adjustment would result in negative stock." });
      }
      updatedItem = upd[0];
    }

    // Insert log
    const { rows: logRows } = await client.query(
      `INSERT INTO inventory_log (menu_id, staff_id, transaction_type, quantity_change, remarks)
       VALUES ($1, $2, 'adjustment', $3, $4)
       RETURNING id, transaction_type, quantity_change, log_date`,
      [targetId, staffId, quantity_change, remarks || null]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      adjustment: logRows[0],
      newItem: updatedItem,
      newStockQuantity: updatedItem.stock_quantity,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

// GET /api/admin/inventory/log
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
      `SELECT il.id, COALESCE(ii.name, mi.name, 'Inventory Item') AS item_name,
              s.name AS staff_name, il.transaction_type,
              il.quantity_change, il.log_date, il.remarks
       FROM inventory_log il
       LEFT JOIN menu_items mi ON mi.id = il.menu_id
       LEFT JOIN inventory_items ii ON ii.id = il.menu_id
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