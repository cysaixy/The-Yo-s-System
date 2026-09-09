// src/controllers/customer/menu.controller.js
import pool from "../../config/db.js";

export async function getMenu(req, res, next) {
  try {
    const [categoriesRes, itemsRes, addonsRes, linksRes] = await Promise.all([
      pool.query("SELECT * FROM categories ORDER BY name ASC"),
      // Only expose items the kitchen has marked available - customers
      // shouldn't see (or be able to order) 86'd items, and this also means
      // the frontend doesn't have to re-filter what it was never sent.
      pool.query("SELECT * FROM menu_items WHERE status = 'available' ORDER BY name ASC"),
      pool.query(
        "SELECT id, name, description, price, category FROM add_ons WHERE status = 'available' ORDER BY name ASC"
      ),
      pool.query("SELECT addon_id, menu_id FROM addon_products"),
    ]);

    // Add-ons are sold on every menu item unless a product link restricts
    // them. Same rule the POS uses: an add-on with NO addon_products rows is
    // global; otherwise it's only offered on the linked items.
    const linked = new Map(); // menu_id -> Set(addon_id)
    linksRes.rows.forEach((l) => {
      if (!linked.has(l.menu_id)) linked.set(l.menu_id, new Set());
      linked.get(l.menu_id).add(l.addon_id);
    });
    const linkedAddonIds = new Set(linksRes.rows.map((l) => l.addon_id));

    const items = itemsRes.rows.map((item) => ({
      ...item,
      add_ons: addonsRes.rows
        .filter(
          (a) => !linkedAddonIds.has(a.id) || linked.get(item.id)?.has(a.id)
        )
        .map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          price: Number(a.price),
          category: a.category,
        })),
    }));

    res.json({
      categories: categoriesRes.rows,
      items,
    });
  } catch (err) {
    next(err);
  }
}