-- ============================================================
-- Check and fix tracking_mode for products with ingredients
-- ============================================================

-- Step 1: Check current status of "testing" product
SELECT 
  mi.id,
  mi.name,
  mi.tracking_mode,
  mi.stock_quantity,
  COUNT(mii.id) as ingredient_count
FROM menu_items mi
LEFT JOIN menu_item_inventory mii ON mii.menu_id = mi.id
WHERE mi.name = 'testing'
GROUP BY mi.id, mi.name, mi.tracking_mode, mi.stock_quantity;

-- Step 2: Check what ingredients it has (if any)
SELECT 
  mi.name as product_name,
  ii.name as ingredient_name,
  mii.quantity as required_quantity,
  mii.unit,
  ii.stock_quantity as available_stock
FROM menu_items mi
JOIN menu_item_inventory mii ON mii.menu_id = mi.id
JOIN inventory_items ii ON ii.id = mii.inventory_id
WHERE mi.name = 'testing';

-- Step 3: Fix ALL products that have ingredients but wrong tracking_mode
UPDATE menu_items mi
SET tracking_mode = 'recipe'
WHERE tracking_mode != 'recipe'
  AND EXISTS (
    SELECT 1 FROM menu_item_inventory mii WHERE mii.menu_id = mi.id
  );

-- Step 4: Verify the fix
SELECT 
  mi.id,
  mi.name,
  mi.tracking_mode,
  mi.stock_quantity,
  COUNT(mii.id) as ingredient_count
FROM menu_items mi
LEFT JOIN menu_item_inventory mii ON mii.menu_id = mi.id
WHERE mi.name IN ('testing', 'TEST')
GROUP BY mi.id, mi.name, mi.tracking_mode, mi.stock_quantity
ORDER BY mi.name;
