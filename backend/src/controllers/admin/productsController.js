// src/controllers/admin/productsController.js
import pool from "../../config/db.js";

// --- Categories ---

export const listCategories = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name FROM categories ORDER BY name ASC"
    );

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (err) {
    next(err);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required." });

    const { rows } = await pool.query(
      `INSERT INTO categories (name) VALUES ($1) RETURNING id, name`,
      [name]
    );
    res.status(201).json({ category: rows[0] });
  } catch (err) {
    next(err);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const { name } = req.body;
    const { rows } = await pool.query(
      `UPDATE categories SET name = $1 WHERE id = $2 RETURNING id, name`,
      [name, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Category not found." });
    res.json({ category: rows[0] });
  } catch (err) {
    next(err);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM categories WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Category not found." });
    res.status(204).send();
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({ error: "Cannot delete category referenced by menu items." });
    }
    next(err);
  }
};

// --- Menu Items ---

export const listAllMenuItems = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT mi.id, mi.category_id, mi.name, mi.description, mi.price,
              mi.image_url, mi.stock_quantity, mi.status, c.name AS category_name
       FROM menu_items mi
       LEFT JOIN categories c ON c.id = mi.category_id
       ORDER BY mi.name`
    );
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
};

export const getMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT mi.id, mi.category_id, mi.name, mi.description, mi.price, 
              mi.image_url, mi.stock_quantity, mi.status, c.name AS category_name
       FROM menu_items mi
       LEFT JOIN categories c ON c.id = mi.category_id
       WHERE mi.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Menu item with ID ${id} not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    if (err.code === "22P02") {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID format.",
      });
    }
    next(err);
  }
};

export const createMenuItem = async (req, res, next) => {
  try {
    const { category_id, name, description, price, image_url, stock_quantity } = req.body;
    if (!category_id || !name || price === undefined) {
      return res.status(400).json({ error: "category_id, name, and price are required." });
    }

    const { rows } = await pool.query(
      `INSERT INTO menu_items (category_id, name, description, price, image_url, stock_quantity)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, price, stock_quantity, status`,
      [category_id, name, description || null, price, image_url || null, stock_quantity || 0]
    );
    res.status(201).json({ item: rows[0] });
  } catch (err) {
    next(err);
  }
};

export const updateMenuItem = async (req, res, next) => {
  try {
    const { name, description, price, image_url, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE menu_items
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           image_url = COALESCE($4, image_url),
           status = COALESCE($5, status)
       WHERE id = $6
       RETURNING id, name, price, status`,
      [name, description, price, image_url, status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Menu item not found." });
    res.json({ item: rows[0] });
  } catch (err) {
    next(err);
  }
};

export const deleteMenuItem = async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM menu_items WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Menu item not found." });
    res.status(204).send();
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({ error: "Cannot delete item because it has order history." });
    }
    next(err);
  }
};