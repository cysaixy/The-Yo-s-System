// src/services/capacityService.js
import pool from '../config/db.js';

/**
 * Calculate available quantity for a single menu item based on its tracking mode.
 * 
 * @param {number} menuId - The menu item ID
 * @param {object} client - Optional database client (for transactions)
 * @returns {Promise<number>} - Available quantity (0 if unavailable or ingredients insufficient)
 */
export async function calculateItemCapacity(menuId, client = null) {
  const db = client || pool;

  // Get menu item tracking mode
  const { rows: menuRows } = await db.query(
    `SELECT tracking_mode, stock_quantity, status 
     FROM menu_items 
     WHERE id = $1`,
    [menuId]
  );

  if (menuRows.length === 0) {
    return 0; // Item doesn't exist
  }

  const { tracking_mode, stock_quantity, status } = menuRows[0];

  // If item is not available, return 0
  if (status !== 'available') {
    return 0;
  }

  switch (tracking_mode) {
    case 'none':
      // Not tracked - always available (return large number)
      return 999999;

    case 'direct':
      // Use menu_items.stock_quantity directly
      return Number(stock_quantity) || 0;

    case 'recipe': {
      // Calculate from ingredients using min(floor(stock / consumption)) formula
      const { rows: ingredients } = await db.query(
        `SELECT mii.inventory_id, mii.quantity as required, 
                ii.stock_quantity as available, ii.unit
         FROM menu_item_inventory mii
         JOIN inventory_items ii ON ii.id = mii.inventory_id
         WHERE mii.menu_id = $1`,
        [menuId]
      );

      if (ingredients.length === 0) {
        // No recipe defined - treat as unavailable
        return 0;
      }

      // Calculate capacity for each ingredient and take the minimum
      let minCapacity = Infinity;

      for (const ingredient of ingredients) {
        const available = Number(ingredient.available) || 0;
        const required = Number(ingredient.required) || 0;

        if (required <= 0) {
          continue; // Skip invalid recipe entries
        }

        const capacity = Math.floor(available / required);
        minCapacity = Math.min(minCapacity, capacity);
      }

      return minCapacity === Infinity ? 0 : Math.max(0, minCapacity);
    }

    default:
      return 0;
  }
}

/**
 * Calculate available quantities for multiple menu items in bulk.
 * 
 * @param {number[]} menuIds - Array of menu item IDs
 * @param {object} client - Optional database client (for transactions)
 * @returns {Promise<Object>} - Map of menuId -> available quantity
 */
export async function calculateBulkCapacity(menuIds, client = null) {
  if (!menuIds || menuIds.length === 0) {
    return {};
  }

  const db = client || pool;
  const capacities = {};

  // Get all menu items with their tracking modes
  const { rows: menuItems } = await db.query(
    `SELECT id, tracking_mode, stock_quantity, status 
     FROM menu_items 
     WHERE id = ANY($1)`,
    [menuIds]
  );

  // Separate by tracking mode for efficient processing
  const noneItems = [];
  const directItems = [];
  const recipeItems = [];

  for (const item of menuItems) {
    if (item.status !== 'available') {
      capacities[item.id] = 0;
      continue;
    }

    switch (item.tracking_mode) {
      case 'none':
        noneItems.push(item.id);
        capacities[item.id] = 999999;
        break;
      case 'direct':
        directItems.push(item.id);
        capacities[item.id] = Number(item.stock_quantity) || 0;
        break;
      case 'recipe':
        recipeItems.push(item.id);
        break;
    }
  }

  // Calculate recipe-based items (most complex)
  if (recipeItems.length > 0) {
    const { rows: allIngredients } = await db.query(
      `SELECT mii.menu_id, mii.inventory_id, mii.quantity as required, 
              ii.stock_quantity as available
       FROM menu_item_inventory mii
       JOIN inventory_items ii ON ii.id = mii.inventory_id
       WHERE mii.menu_id = ANY($1)`,
      [recipeItems]
    );

    // Group ingredients by menu_id
    const ingredientsByMenu = {};
    for (const ing of allIngredients) {
      if (!ingredientsByMenu[ing.menu_id]) {
        ingredientsByMenu[ing.menu_id] = [];
      }
      ingredientsByMenu[ing.menu_id].push(ing);
    }

    // Calculate capacity for each recipe item
    for (const menuId of recipeItems) {
      const ingredients = ingredientsByMenu[menuId] || [];

      if (ingredients.length === 0) {
        capacities[menuId] = 0;
        continue;
      }

      let minCapacity = Infinity;
      for (const ingredient of ingredients) {
        const available = Number(ingredient.available) || 0;
        const required = Number(ingredient.required) || 0;

        if (required <= 0) continue;

        const capacity = Math.floor(available / required);
        minCapacity = Math.min(minCapacity, capacity);
      }

      capacities[menuId] = minCapacity === Infinity ? 0 : Math.max(0, minCapacity);
    }
  }

  return capacities;
}

/**
 * Check if a specific quantity of a menu item can be fulfilled.
 * 
 * @param {number} menuId - The menu item ID
 * @param {number} requestedQty - Requested quantity
 * @param {object} client - Optional database client (for transactions)
 * @returns {Promise<{available: boolean, currentCapacity: number}>}
 */
export async function checkAvailability(menuId, requestedQty, client = null) {
  const capacity = await calculateItemCapacity(menuId, client);
  return {
    available: capacity >= requestedQty,
    currentCapacity: capacity,
  };
}

/**
 * Get detailed capacity breakdown showing which ingredient is the bottleneck.
 * 
 * @param {number} menuId - The menu item ID
 * @param {object} client - Optional database client (for transactions)
 * @returns {Promise<Object>} - Detailed capacity information
 */
export async function getCapacityBreakdown(menuId, client = null) {
  const db = client || pool;

  const { rows: menuRows } = await db.query(
    `SELECT tracking_mode, stock_quantity, status, name 
     FROM menu_items 
     WHERE id = $1`,
    [menuId]
  );

  if (menuRows.length === 0) {
    return { error: 'Menu item not found' };
  }

  const { tracking_mode, stock_quantity, status, name } = menuRows[0];

  const result = {
    menuId,
    name,
    trackingMode: tracking_mode,
    status,
    capacity: 0,
    ingredients: [],
  };

  if (status !== 'available') {
    result.reason = 'Item not available';
    return result;
  }

  switch (tracking_mode) {
    case 'none':
      result.capacity = 999999;
      result.reason = 'Not tracked';
      break;

    case 'direct':
      result.capacity = Number(stock_quantity) || 0;
      result.reason = 'Direct stock';
      break;

    case 'recipe': {
      const { rows: ingredients } = await db.query(
        `SELECT mii.inventory_id, ii.name, mii.quantity as required, 
                ii.stock_quantity as available, ii.unit,
                FLOOR(ii.stock_quantity / NULLIF(mii.quantity, 0)) as possible_servings
         FROM menu_item_inventory mii
         JOIN inventory_items ii ON ii.id = mii.inventory_id
         WHERE mii.menu_id = $1
         ORDER BY possible_servings ASC`,
        [menuId]
      );

      if (ingredients.length === 0) {
        result.reason = 'No recipe defined';
        break;
      }

      let minCapacity = Infinity;
      let bottleneck = null;

      for (const ing of ingredients) {
        const capacity = Number(ing.possible_servings) || 0;
        result.ingredients.push({
          inventoryId: ing.inventory_id,
          name: ing.name,
          required: Number(ing.required),
          available: Number(ing.available),
          unit: ing.unit,
          capacity: capacity,
        });

        if (capacity < minCapacity) {
          minCapacity = capacity;
          bottleneck = ing.name;
        }
      }

      result.capacity = minCapacity === Infinity ? 0 : Math.max(0, minCapacity);
      result.bottleneck = bottleneck;
      result.reason = bottleneck ? `Limited by ${bottleneck}` : 'Recipe-based';
      break;
    }
  }

  return result;
}
