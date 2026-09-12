// src/services/stockDeductionService.js
import pool from '../config/db.js';

/**
 * Unified stock deduction service for all order types.
 * Aggregates cart items by ingredient, validates availability, and deducts atomically.
 * Prevents overselling through conditional UPDATE with row-level locks.
 */

/**
 * Deduct stock for a complete cart transaction.
 * 
 * @param {object} params - Deduction parameters
 * @param {Array} params.items - Cart items with validated structure
 * @param {number} params.orderId - Order ID for logging
 * @param {string} params.orderType - Order type (online, dine_in, pickup, etc.)
 * @param {number|null} params.staffId - Staff ID (null for customer orders)
 * @param {object} params.client - Database transaction client
 * @returns {Promise<{success: boolean, error?: string, unavailableItem?: string}>}
 * 
 * Expected item structure:
 * {
 *   menu_id: number,
 *   name: string,
 *   quantity: number,
 *   tracking_mode: string,
 *   inventory_components: [{inventory_id, quantity, inventory_name}],
 *   addons: [{
 *     id: number,
 *     name: string,
 *     quantity: number,
 *     inventory_components: [{inventory_id, quantity, inventory_name}]
 *   }]
 * }
 */
export async function deductStock(params) {
  const { items, orderId, orderType, staffId = null, client } = params;

  if (!client) {
    throw new Error('Database client is required for stock deduction');
  }

  // Step 1: Aggregate all ingredients needed for the entire cart
  const ingredientMap = new Map(); // inventory_id -> { needed, name, sources: [{type, name, menuId}] }

  for (const item of items) {
    const trackingMode = item.tracking_mode || 'direct';

    // Handle recipe-based products
    if (trackingMode === 'recipe' && item.inventory_components) {
      for (const comp of item.inventory_components) {
        const inventoryId = comp.inventory_id;
        const needed = Number(comp.quantity) * item.quantity;

        if (!ingredientMap.has(inventoryId)) {
          ingredientMap.set(inventoryId, {
            needed: 0,
            name: comp.inventory_name,
            sources: [],
          });
        }

        const entry = ingredientMap.get(inventoryId);
        entry.needed += needed;
        entry.sources.push({
          type: 'product',
          name: item.name,
          menuId: item.menu_id,
          quantity: item.quantity,
        });
      }
    }

    // Handle direct stock products (legacy)
    if (trackingMode === 'direct') {
      // For direct tracking, we update menu_items.stock_quantity
      // This is handled separately below
    }

    // Handle add-ons
    if (Array.isArray(item.addons)) {
      for (const addon of item.addons) {
        if (addon.inventory_components) {
          for (const comp of addon.inventory_components) {
            const inventoryId = comp.inventory_id;
            const needed = Number(comp.quantity) * addon.quantity;

            if (!ingredientMap.has(inventoryId)) {
              ingredientMap.set(inventoryId, {
                needed: 0,
                name: comp.inventory_name,
                sources: [],
              });
            }

            const entry = ingredientMap.get(inventoryId);
            entry.needed += needed;
            entry.sources.push({
              type: 'addon',
              name: `${addon.name} (add-on for ${item.name})`,
              addonId: addon.id,
              menuId: item.menu_id,
              quantity: addon.quantity,
            });
          }
        }
      }
    }
  }

  // Step 2: Lock and deduct raw ingredients atomically
  for (const [inventoryId, data] of ingredientMap.entries()) {
    const { needed, name, sources } = data;

    // Conditional UPDATE with row lock - fails if insufficient stock
    const { rowCount } = await client.query(
      `UPDATE inventory_items 
       SET stock_quantity = stock_quantity - $1 
       WHERE id = $2 AND stock_quantity >= $1`,
      [needed, inventoryId]
    );

    if (rowCount === 0) {
      // Check current stock to give better error message
      const { rows } = await client.query(
        'SELECT stock_quantity, unit FROM inventory_items WHERE id = $1',
        [inventoryId]
      );

      const current = rows[0] ? Number(rows[0].stock_quantity) : 0;
      const unit = rows[0]?.unit || '';

      return {
        success: false,
        error: `Insufficient ${name} (need ${needed}${unit}, have ${current}${unit})`,
        unavailableItem: sources[0]?.name || 'Unknown item',
        inventoryId,
        needed,
        available: current,
      };
    }

    // Log the deduction
    const sourceDesc = sources.map(s => `${s.name} (×${s.quantity})`).join(', ');
    await client.query(
      `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, transaction_type, quantity_change, remarks)
       VALUES ($1, $2, $3, 'sale', $4, $5)`,
      [
        inventoryId,
        sources[0]?.menuId || null,
        staffId,
        -needed,
        `${orderType} Order #${orderId} · ${sourceDesc}`,
      ]
    );
  }

  // Step 3: Deduct direct-tracked products (legacy path)
  for (const item of items) {
    const trackingMode = item.tracking_mode || 'direct';

    if (trackingMode === 'direct') {
      // Only deduct if product has no recipe (backward compatibility)
      if (!item.inventory_components || item.inventory_components.length === 0) {
        const { rowCount } = await client.query(
          `UPDATE menu_items 
           SET stock_quantity = stock_quantity - $1 
           WHERE id = $2 AND stock_quantity >= $1`,
          [item.quantity, item.menu_id]
        );

        if (rowCount === 0) {
          // Check current stock
          const { rows } = await client.query(
            'SELECT stock_quantity FROM menu_items WHERE id = $1',
            [item.menu_id]
          );

          const current = rows[0] ? Number(rows[0].stock_quantity) : 0;

          return {
            success: false,
            error: `Insufficient stock for ${item.name} (need ${item.quantity}, have ${current})`,
            unavailableItem: item.name,
            menuId: item.menu_id,
            needed: item.quantity,
            available: current,
          };
        }

        // Log direct product deduction
        await client.query(
          `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, transaction_type, quantity_change, remarks)
           VALUES (NULL, $1, $2, 'sale', $3, $4)`,
          [item.menu_id, staffId, -item.quantity, `${orderType} Order #${orderId} · ${item.name} (direct stock)`]
        );
      }
    }
  }

  return { success: true };
}

/**
 * Restore stock for a cancelled/refunded order.
 * Reverses the exact quantities that were deducted.
 * 
 * @param {object} params - Restoration parameters
 * @param {number} params.orderId - Order ID to restore
 * @param {string} params.reason - Reason for restoration (cancellation, refund, etc.)
 * @param {number|null} params.staffId - Staff ID performing restoration
 * @param {object} params.client - Database transaction client
 * @returns {Promise<{success: boolean, restoredItems: number}>}
 */
export async function restoreStock(params) {
  const { orderId, reason, staffId = null, client } = params;

  if (!client) {
    throw new Error('Database client is required for stock restoration');
  }

  // Find all inventory deductions for this order
  const { rows: logs } = await client.query(
    `SELECT inventory_id, menu_id, quantity_change 
     FROM inventory_log 
     WHERE transaction_type = 'sale' 
       AND remarks LIKE $1
     ORDER BY id`,
    [`%Order #${orderId}%`]
  );

  let restoredCount = 0;

  for (const log of logs) {
    const restoreQty = Math.abs(Number(log.quantity_change));

    if (log.inventory_id) {
      // Restore raw ingredient
      await client.query(
        'UPDATE inventory_items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [restoreQty, log.inventory_id]
      );

      await client.query(
        `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, transaction_type, quantity_change, remarks)
         VALUES ($1, $2, $3, 'adjustment', $4, $5)`,
        [log.inventory_id, log.menu_id, staffId, restoreQty, `Restore: ${reason} (Order #${orderId})`]
      );

      restoredCount++;
    } else if (log.menu_id) {
      // Restore direct product stock
      await client.query(
        'UPDATE menu_items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [restoreQty, log.menu_id]
      );

      await client.query(
        `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, transaction_type, quantity_change, remarks)
         VALUES (NULL, $1, $2, 'adjustment', $3, $4)`,
        [log.menu_id, staffId, restoreQty, `Restore: ${reason} (Order #${orderId})`]
      );

      restoredCount++;
    }
  }

  return {
    success: true,
    restoredItems: restoredCount,
  };
}

/**
 * Pre-validate stock availability without deducting.
 * Useful for cart validation before checkout.
 * 
 * @param {Array} items - Cart items (same structure as deductStock)
 * @param {object} client - Optional database client
 * @returns {Promise<{available: boolean, unavailableItems: Array}>}
 */
export async function validateStockAvailability(items, client = null) {
  const db = client || pool;
  const unavailableItems = [];

  // Aggregate ingredients
  const ingredientMap = new Map();

  for (const item of items) {
    const trackingMode = item.tracking_mode || 'direct';

    if (trackingMode === 'recipe' && item.inventory_components) {
      for (const comp of item.inventory_components) {
        const inventoryId = comp.inventory_id;
        const needed = Number(comp.quantity) * item.quantity;

        if (!ingredientMap.has(inventoryId)) {
          ingredientMap.set(inventoryId, { needed: 0, name: comp.inventory_name, itemName: item.name });
        }
        ingredientMap.get(inventoryId).needed += needed;
      }
    }

    if (trackingMode === 'direct' && (!item.inventory_components || item.inventory_components.length === 0)) {
      // Check menu_items.stock_quantity for direct products
      const { rows } = await db.query(
        'SELECT stock_quantity FROM menu_items WHERE id = $1',
        [item.menu_id]
      );
      const available = rows[0] ? Number(rows[0].stock_quantity) : 0;

      if (available < item.quantity) {
        unavailableItems.push({
          name: item.name,
          needed: item.quantity,
          available,
        });
      }
    }

    // Check add-ons
    if (Array.isArray(item.addons)) {
      for (const addon of item.addons) {
        if (addon.inventory_components) {
          for (const comp of addon.inventory_components) {
            const inventoryId = comp.inventory_id;
            const needed = Number(comp.quantity) * addon.quantity;

            if (!ingredientMap.has(inventoryId)) {
              ingredientMap.set(inventoryId, { needed: 0, name: comp.inventory_name, itemName: `${addon.name} (add-on)` });
            }
            ingredientMap.get(inventoryId).needed += needed;
          }
        }
      }
    }
  }

  // Check aggregated ingredients
  for (const [inventoryId, data] of ingredientMap.entries()) {
    const { rows } = await db.query(
      'SELECT stock_quantity FROM inventory_items WHERE id = $1',
      [inventoryId]
    );
    const available = rows[0] ? Number(rows[0].stock_quantity) : 0;

    if (available < data.needed) {
      unavailableItems.push({
        name: data.itemName,
        ingredient: data.name,
        needed: data.needed,
        available,
      });
    }
  }

  return {
    available: unavailableItems.length === 0,
    unavailableItems,
  };
}
