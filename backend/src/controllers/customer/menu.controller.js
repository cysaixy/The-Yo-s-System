// src/controllers/customer/menu.controller.js
import pool from "../../config/db.js";

export async function getMenu(req, res, next) {
  try {
    const [categoriesRes, itemsRes] = await Promise.all([
      pool.query("SELECT * FROM categories ORDER BY name ASC"),
      pool.query("SELECT * FROM menu_items ORDER BY name ASC"),
    ]);

    res.json({
      categories: categoriesRes.rows,
      items: itemsRes.rows,
    });
  } catch (err) {
    next(err);
  }
}