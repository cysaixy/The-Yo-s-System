// src/utils/inventoryRestore.js
import pool from '../config/db.js';
import { restoreStock } from '../services/stockDeductionService.js';

/**
 * Restore inventory for a cancelled order using movement-based reversal.
 * Uses inventory_log to restore the EXACT quantities that were deducted,
 * not the current recipe (which may have changed since order placement).
 * 
 * @param {object} client - Database transaction client
 * @param {number} orderId - Order ID to restore
 * @param {number|null} staffId - Staff performing the cancellation (null for customer)
 */
export async function restoreOrderInventory(client, orderId, staffId = null) {
  // Use the unified stock restoration service
  const result = await restoreStock({
    orderId,
    reason: 'Order Cancellation',
    staffId,
    client,
  });

  return result;
}

/**
 * Legacy restoration function that re-queries recipes.
 * Kept for backward compatibility but not recommended.
 * Issue: If recipes change between order and cancellation,
 * restoration will use NEW recipe quantities, not original.
 * 
 * @deprecated Use restoreOrderInventory instead (uses movement-based reversal)
 */
export async function restoreOrderInventoryLegacy(client, orderId, staffId = null) {
  // Get all order items with their add-ons
  const { rows: orderItems } = await client.query(
    `SELECT oi.id, oi.menu_id, oi.quantity, oi.notes
     FROM order_items oi
     WHERE oi.order_id = $1`,
    [orderId]
  );

  for (const item of orderItems) {
    // Restore raw ingredients for the menu item
    const { rows: itemComps } = await client.query(
      `SELECT mii.inventory_id, mii.quantity, mii.unit, ii.name AS inventory_name
       FROM menu_item_inventory mii
       JOIN inventory_items ii ON ii.id = mii.inventory_id
       WHERE mii.menu_id = $1`,
      [item.menu_id]
    );

    for (const comp of itemComps) {
      const consumed = Number(comp.quantity) * item.quantity;
      await client.query(
        'UPDATE inventory_items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [consumed, comp.inventory_id]
      );
      await client.query(
        `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, transaction_type, quantity_change, remarks)
         VALUES ($1, $2, $3, 'return', $4, $5)`,
        [comp.inventory_id, item.menu_id, staffId, consumed, `Order #${orderId} cancelled · ${comp.inventory_name} restored`]
      );
    }

    // Restore add-ons
    const { rows: addons } = await client.query(
      `SELECT oia.id, oia.addon_id, oia.name, oia.quantity
       FROM order_item_add_ons oia
       WHERE oia.order_item_id = $1`,
      [item.id]
    );

    for (const addon of addons) {
      const { rows: addonComps } = await client.query(
        `SELECT ai.inventory_id, ai.quantity, ai.unit, ii.name AS inventory_name
         FROM addon_inventory ai
         JOIN inventory_items ii ON ii.id = ai.inventory_id
         WHERE ai.addon_id = $1`,
        [addon.addon_id]
      );

      for (const comp of addonComps) {
        const consumed = Number(comp.quantity) * addon.quantity;
        await client.query(
          'UPDATE inventory_items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
          [consumed, comp.inventory_id]
        );
        await client.query(
          `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, transaction_type, quantity_change, remarks)
           VALUES ($1, $2, $3, 'return', $4, $5)`,
          [comp.inventory_id, item.menu_id, staffId, consumed, `Order #${orderId} cancelled · ${addon.name} (${comp.inventory_name}) restored`]
        );
      }
    }

    // Restore direct stock on menu_items if item has no raw ingredients
    if (!itemComps || itemComps.length === 0) {
      await client.query(
        'UPDATE menu_items SET stock_quantity = stock_quantity + $1 WHERE id = $2 AND stock_quantity IS NOT NULL',
        [item.quantity, item.menu_id]
      );
      await client.query(
        `INSERT INTO inventory_log (inventory_id, menu_id, staff_id, transaction_type, quantity_change, remarks)
         VALUES (NULL, $1, $2, 'return', $3, $4)`,
        [item.menu_id, staffId, item.quantity, `Order #${orderId} cancelled · ${item.notes || 'Menu item'} restored`]
      );
    }
  }
}
