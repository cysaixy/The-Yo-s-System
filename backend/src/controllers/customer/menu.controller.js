// src/controllers/customer/menu.controller.js
import pool from '../../config/db.js';
import { calculateBulkCapacity } from '../../services/capacityService.js';

export async function getMenu(req, res, next) {
  try {
    const [categoriesRes, itemsRes, addonsRes, linksRes, addonInvRes] = await Promise.all([
      pool.query('SELECT * FROM categories ORDER BY name ASC'),
      // Fetch items with their tracking mode - we'll calculate real capacity below
      pool.query(`
        SELECT id, category_id, name, description, price, image_url, 
               stock_quantity, status, tracking_mode 
        FROM menu_items 
        WHERE status = 'available' 
        ORDER BY name ASC
      `),
      pool.query(
        'SELECT id, name, description, price, category FROM add_ons WHERE status = \'available\' ORDER BY name ASC'
      ),
      pool.query('SELECT addon_id, menu_id FROM addon_products'),
      // Fetch inventory components for all add-ons so we can filter out-of-stock ones
      pool.query(`
        SELECT ai.addon_id, ai.quantity AS required, ii.stock_quantity AS available
        FROM addon_inventory ai
        JOIN inventory_items ii ON ii.id = ai.inventory_id
      `),
    ]);

    // Calculate real-time capacity for all menu items
    const menuIds = itemsRes.rows.map(item => item.id);
    const capacities = menuIds.length > 0 
      ? await calculateBulkCapacity(menuIds) 
      : {};

    // ---------- Add-on stock check ----------
    // Group inventory components by addon_id
    const addonInvMap = new Map(); // addon_id -> [{ required, available }]
    addonInvRes.rows.forEach(row => {
      if (!addonInvMap.has(row.addon_id)) addonInvMap.set(row.addon_id, []);
      addonInvMap.get(row.addon_id).push({
        required: Number(row.required),
        available: Number(row.available),
      });
    });

    // Determine which add-ons are actually in stock
    const addonInStock = new Set();
    addonsRes.rows.forEach(addon => {
      const components = addonInvMap.get(addon.id);
      if (!components || components.length === 0) {
        // No inventory links → treat as always available (not ingredient-tracked)
        addonInStock.add(addon.id);
        return;
      }
      // All linked inventory items must have sufficient stock
      const allAvailable = components.every(c => c.available >= c.required);
      if (allAvailable) addonInStock.add(addon.id);
    });

    // ---------- Product link map ----------
    // Add-ons are sold on every menu item unless a product link restricts
    // them. Same rule the POS uses: an add-on with NO addon_products rows is
    // global; otherwise it's only offered on the linked items.
    const linked = new Map(); // menu_id -> Set(addon_id)
    linksRes.rows.forEach((l) => {
      if (!linked.has(l.menu_id)) linked.set(l.menu_id, new Set());
      linked.get(l.menu_id).add(l.addon_id);
    });
    const linkedAddonIds = new Set(linksRes.rows.map((l) => l.addon_id));

    const items = itemsRes.rows
      .map((item) => {
        const availableQuantity = capacities[item.id] || 0;
        
        // Item status based on real-time capacity
        // - 'available': menu_items.status = 'available' AND capacity > 0
        // - 'out_of_stock': menu_items.status = 'available' BUT capacity = 0 (temporarily unavailable)
        // - items with menu_items.status != 'available' are filtered out entirely (permanently removed by kitchen)
        const effectiveStatus = availableQuantity > 0 ? 'available' : 'out_of_stock';

        return {
          id: item.id,
          category_id: item.category_id,
          name: item.name,
          description: item.description,
          price: Number(item.price),
          image_url: item.image_url,
          status: effectiveStatus,
          available_quantity: availableQuantity,
          tracking_mode: item.tracking_mode,
          add_ons: addonsRes.rows
            .filter(
              (a) =>
                // Must be in-stock (passes inventory check)
                addonInStock.has(a.id) &&
                // Must be applicable to this product (global or linked)
                (!linkedAddonIds.has(a.id) || linked.get(item.id)?.has(a.id))
            )
            .map((a) => ({
              id: a.id,
              name: a.name,
              description: a.description,
              price: Number(a.price),
              category: a.category,
            })),
        };
      });

    res.json({
      categories: categoriesRes.rows,
      items,
    });
  } catch (err) {
    next(err);
  }
}