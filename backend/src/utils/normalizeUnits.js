// src/utils/normalizeUnits.js
// Utility script to normalize existing inventory units to base units

import pool from '../config/db.js';
import { validateAndNormalize, formatQuantity } from '../services/unitConversionService.js';

/**
 * Scan and normalize all inventory_items to use base units.
 */
export async function normalizeInventoryUnits() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Scanning inventory_items for unit normalization...\n');
    
    const { rows: items } = await client.query(`
      SELECT id, name, stock_quantity, unit, unit_cost
      FROM inventory_items
      ORDER BY id
    `);
    
    if (items.length === 0) {
      console.log('No inventory items found.');
      return { normalized: 0, errors: [] };
    }
    
    console.log(`Found ${items.length} inventory items.\n`);
    
    let normalizedCount = 0;
    const errors = [];
    const changes = [];
    
    await client.query('BEGIN');
    
    for (const item of items) {
      const result = validateAndNormalize({
        quantity: item.stock_quantity,
        unit: item.unit || 'pcs',
      });
      
      if (result.error && !result.originalQuantity) {
        errors.push({
          id: item.id,
          name: item.name,
          error: result.error,
        });
        continue;
      }
      
      // Check if conversion is needed
      const needsUpdate = result.originalQuantity !== undefined;
      
      if (needsUpdate) {
        // Also adjust unit_cost to reflect the new unit
        const costMultiplier = result.quantity / result.originalQuantity;
        const newUnitCost = Number(item.unit_cost) / costMultiplier;
        
        await client.query(
          `UPDATE inventory_items 
           SET stock_quantity = $1, unit = $2, unit_cost = $3
           WHERE id = $4`,
          [result.quantity, result.unit, newUnitCost, item.id]
        );
        
        changes.push({
          id: item.id,
          name: item.name,
          from: `${item.stock_quantity} ${item.unit}`,
          to: `${result.quantity} ${result.unit}`,
          costFrom: `₱${item.unit_cost}/${item.unit}`,
          costTo: `₱${newUnitCost.toFixed(2)}/${result.unit}`,
        });
        
        normalizedCount++;
      }
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Inventory normalization complete!\n');
    console.log(`Normalized: ${normalizedCount} items`);
    console.log(`Errors: ${errors.length}\n`);
    
    if (changes.length > 0) {
      console.log('📋 Changes made:');
      changes.forEach(c => {
        console.log(`  • ${c.name} (ID: ${c.id})`);
        console.log(`    Quantity: ${c.from} → ${c.to}`);
        console.log(`    Unit Cost: ${c.costFrom} → ${c.costTo}`);
      });
      console.log('');
    }
    
    if (errors.length > 0) {
      console.log('⚠️  Errors encountered:');
      errors.forEach(e => {
        console.log(`  • ${e.name} (ID: ${e.id}): ${e.error}`);
      });
    }
    
    return { normalized: normalizedCount, errors, changes };
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error during normalization:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Scan and normalize recipe units (menu_item_inventory, addon_inventory).
 */
export async function normalizeRecipeUnits() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Scanning recipe ingredients for unit normalization...\n');
    
    // Check menu_item_inventory
    const { rows: menuItems } = await client.query(`
      SELECT mii.id, mii.menu_id, mii.inventory_id, mii.quantity, mii.unit,
             mi.name as product_name, ii.name as ingredient_name
      FROM menu_item_inventory mii
      JOIN menu_items mi ON mi.id = mii.menu_id
      JOIN inventory_items ii ON ii.id = mii.inventory_id
      ORDER BY mii.id
    `);
    
    // Check addon_inventory
    const { rows: addonItems } = await client.query(`
      SELECT ai.id, ai.addon_id, ai.inventory_id, ai.quantity, ai.unit,
             a.name as addon_name, ii.name as ingredient_name
      FROM addon_inventory ai
      JOIN add_ons a ON a.id = ai.addon_id
      JOIN inventory_items ii ON ii.id = ai.inventory_id
      ORDER BY ai.id
    `);
    
    console.log(`Found ${menuItems.length} menu item ingredients`);
    console.log(`Found ${addonItems.length} addon ingredients\n`);
    
    let normalizedCount = 0;
    const errors = [];
    const changes = [];
    
    await client.query('BEGIN');
    
    // Normalize menu_item_inventory
    for (const item of menuItems) {
      const result = validateAndNormalize({
        quantity: item.quantity,
        unit: item.unit || 'g',
      });
      
      if (result.error && !result.originalQuantity) {
        errors.push({
          type: 'menu_item_inventory',
          id: item.id,
          product: item.product_name,
          ingredient: item.ingredient_name,
          error: result.error,
        });
        continue;
      }
      
      if (result.originalQuantity !== undefined) {
        await client.query(
          `UPDATE menu_item_inventory 
           SET quantity = $1, unit = $2
           WHERE id = $3`,
          [result.quantity, result.unit, item.id]
        );
        
        changes.push({
          type: 'Product Recipe',
          name: `${item.product_name} → ${item.ingredient_name}`,
          from: `${item.quantity} ${item.unit}`,
          to: `${result.quantity} ${result.unit}`,
        });
        
        normalizedCount++;
      }
    }
    
    // Normalize addon_inventory
    for (const item of addonItems) {
      const result = validateAndNormalize({
        quantity: item.quantity,
        unit: item.unit || 'g',
      });
      
      if (result.error && !result.originalQuantity) {
        errors.push({
          type: 'addon_inventory',
          id: item.id,
          addon: item.addon_name,
          ingredient: item.ingredient_name,
          error: result.error,
        });
        continue;
      }
      
      if (result.originalQuantity !== undefined) {
        await client.query(
          `UPDATE addon_inventory 
           SET quantity = $1, unit = $2
           WHERE id = $3`,
          [result.quantity, result.unit, item.id]
        );
        
        changes.push({
          type: 'Add-on Recipe',
          name: `${item.addon_name} → ${item.ingredient_name}`,
          from: `${item.quantity} ${item.unit}`,
          to: `${result.quantity} ${result.unit}`,
        });
        
        normalizedCount++;
      }
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Recipe normalization complete!\n');
    console.log(`Normalized: ${normalizedCount} recipe entries`);
    console.log(`Errors: ${errors.length}\n`);
    
    if (changes.length > 0) {
      console.log('📋 Changes made:');
      changes.forEach(c => {
        console.log(`  • [${c.type}] ${c.name}`);
        console.log(`    ${c.from} → ${c.to}`);
      });
      console.log('');
    }
    
    if (errors.length > 0) {
      console.log('⚠️  Errors encountered:');
      errors.forEach(e => {
        console.log(`  • [${e.type}] ${e.product || e.addon} (${e.ingredient}): ${e.error}`);
      });
    }
    
    return { normalized: normalizedCount, errors, changes };
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error during recipe normalization:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run both normalizations.
 */
export async function normalizeAllUnits() {
  console.log('🚀 Starting unit normalization for entire database\n');
  console.log('━'.repeat(60));
  console.log('');
  
  const inventoryResult = await normalizeInventoryUnits();
  
  console.log('');
  console.log('━'.repeat(60));
  console.log('');
  
  const recipeResult = await normalizeRecipeUnits();
  
  console.log('');
  console.log('━'.repeat(60));
  console.log('');
  console.log('🎉 All normalizations complete!');
  console.log(`Total items normalized: ${inventoryResult.normalized + recipeResult.normalized}`);
  console.log(`Total errors: ${inventoryResult.errors.length + recipeResult.errors.length}`);
  
  await pool.end();
  
  return {
    inventory: inventoryResult,
    recipes: recipeResult,
  };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  normalizeAllUnits().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
