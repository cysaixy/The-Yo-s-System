// src/controllers/customer/menu.controller.js
import pool from "../../config/db.js";

export async function getMenu(req, res, next) {
  try {
    const [categoriesRes, itemsRes] = await Promise.all([
      pool.query("SELECT * FROM categories ORDER BY name ASC"),
      // Only expose items the kitchen has marked available - customers
      // shouldn't see (or be able to order) 86'd items, and this also means
      // the frontend doesn't have to re-filter what it was never sent.
      pool.query("SELECT * FROM menu_items WHERE status = 'available' ORDER BY name ASC"),
    ]);

    res.json({
      categories: categoriesRes.rows,
      items: itemsRes.rows,
    });
  } catch (err) {
    next(err);
  }
}