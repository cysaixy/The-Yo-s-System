// src/controllers/admin/productsController.js
import pool from "../../config/db.js";
import prisma from "../../lib/prisma.js";
import {
  getProductJsonFields,
  getRecipeInventory,
  toInventoryComponents,
} from "../../lib/productJsonFields.js";

// --- Categories ---

export const listCategories = async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { productType: "menu_item" },
      select: { category: true },
    });
    const categories = [...new Set(
      products
        .map(({ category }) => category?.trim())
        .filter(Boolean)
    )]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ id: name, name }));

    return res.status(200).json({
      success: true,
      data: categories,
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

// --- Menu Items (Products) ---

export const listAllMenuItems = async (req, res, next) => {
  try {
    const items = await prisma.product.findMany({
      where: { productType: "menu_item" },
      select: {
        id: true,
        category: true,
        name: true,
        description: true,
        price: true,
        cost: true,
        imageUrl: true,
        stockQuantity: true,
        status: true,
      },
      orderBy: { name: "asc" },
    });
    const fieldsByProductId = await getProductJsonFields(items.map(({ id }) => id));
    const inventoryById = await getRecipeInventory(fieldsByProductId);

    const itemsWithInv = items.map((item) => ({
      id: item.id,
      category_id: item.category,
      category_name: item.category,
      name: item.name,
      description: item.description,
      price: Number(item.price),
      cost: Number(item.cost ?? 0),
      image_url: item.imageUrl,
      stock_quantity: item.stockQuantity,
      status: item.status || "available",
      inventory_components: toInventoryComponents(
        fieldsByProductId.get(item.id)?.ingredients || [],
        inventoryById
      ),
    }));

    res.json({ items: itemsWithInv });
  } catch (err) {
    next(err);
  }
};

export const getMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT menu_items.id, menu_items.category_id, menu_items.name, menu_items.description, menu_items.price, menu_items.cost,
              menu_items.image_url, menu_items.stock_quantity, menu_items.status, categories.name AS category_name
       FROM menu_items
       LEFT JOIN categories ON categories.id = menu_items.category_id
       WHERE menu_items.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Menu item with ID ${id} not found.`,
      });
    }

    const { rows: invComp } = await pool.query(
      `SELECT menu_item_inventory.id, menu_item_inventory.inventory_id, menu_item_inventory.quantity, menu_item_inventory.unit, inventory_items.name AS inventory_name, inventory_items.stock_quantity
       FROM menu_item_inventory
       JOIN inventory_items ON inventory_items.id = menu_item_inventory.inventory_id
       WHERE menu_item_inventory.menu_id = $1`,
      [id]
    );

    return res.status(200).json({
      success: true,
      data: {
        ...rows[0],
        inventory_components: invComp,
      },
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
  const client = await pool.connect();
  try {
    const { category_id, name, description, price, cost, image_url, stock_quantity, status, inventory_components } = req.body;
    if (!category_id || !name || price === undefined) {
      return res.status(400).json({ error: "category_id, name, and price are required." });
    }

    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO menu_items (category_id, name, description, price, cost, image_url, stock_quantity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, category_id, name, description, price, cost, image_url, stock_quantity, status`,
      [category_id, name, description || null, price, cost || 0, image_url || null, stock_quantity || 0, status || 'available']
    );
    const item = rows[0];

    // Insert linked inventory components
    if (Array.isArray(inventory_components)) {
      for (const comp of inventory_components) {
        if (comp.inventory_id && Number(comp.quantity) > 0) {
          await client.query(
            `INSERT INTO menu_item_inventory (menu_id, inventory_id, quantity, unit)
             VALUES ($1, $2, $3, $4)`,
            [item.id, comp.inventory_id, comp.quantity, comp.unit || 'g']
          );
        }
      }
    }

    await client.query("COMMIT");

    const { rows: invComp } = await pool.query(
      `SELECT menu_item_inventory.id, menu_item_inventory.inventory_id, menu_item_inventory.quantity, menu_item_inventory.unit, inventory_items.name AS inventory_name, inventory_items.stock_quantity
       FROM menu_item_inventory
       JOIN inventory_items ON inventory_items.id = menu_item_inventory.inventory_id
       WHERE menu_item_inventory.menu_id = $1`,
      [item.id]
    );

    res.status(201).json({ item: { ...item, inventory_components: invComp } });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
};

export const updateMenuItem = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { category_id, name, description, price, cost, image_url, status, stock_quantity, inventory_components } = req.body;

    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE menu_items
       SET category_id = COALESCE($1, category_id),
           name = COALESCE($2, name),
           description = COALESCE($3, description),
           price = COALESCE($4, price),
           cost = COALESCE($5, cost),
           image_url = COALESCE($6, image_url),
           status = COALESCE($7, status),
           stock_quantity = COALESCE($8, stock_quantity)
       WHERE id = $9
       RETURNING id, category_id, name, description, price, cost, image_url, status, stock_quantity`,
      [category_id, name, description, price, cost !== undefined ? Number(cost) : undefined, image_url, status, stock_quantity, req.params.id]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Menu item not found." });
    }

    // Re-create inventory components if supplied
    if (Array.isArray(inventory_components)) {
      await client.query(`DELETE FROM menu_item_inventory WHERE menu_id = $1`, [req.params.id]);
      for (const comp of inventory_components) {
        if (comp.inventory_id && Number(comp.quantity) > 0) {
          await client.query(
            `INSERT INTO menu_item_inventory (menu_id, inventory_id, quantity, unit) VALUES ($1, $2, $3, $4)`,
            [req.params.id, comp.inventory_id, comp.quantity, comp.unit || 'g']
          );
        }
      }
    }

    await client.query("COMMIT");

    const { rows: invComp } = await pool.query(
      `SELECT menu_item_inventory.id, menu_item_inventory.inventory_id, menu_item_inventory.quantity, menu_item_inventory.unit, inventory_items.name AS inventory_name, inventory_items.stock_quantity
       FROM menu_item_inventory
       JOIN inventory_items ON inventory_items.id = menu_item_inventory.inventory_id
       WHERE menu_item_inventory.menu_id = $1`,
      [req.params.id]
    );

    res.json({ item: { ...rows[0], inventory_components: invComp } });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
};

export const deleteMenuItem = async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM menu_items WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Menu item not found." });
    res.status(204).send();
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({ error: "Cannot delete item because it has order or bundle history." });
    }
    next(err);
  }
};

// --- ADD-ONS ---

export const listAddons = async (req, res, next) => {
  try {
    const addons = await prisma.product.findMany({
      where: { productType: "add_on" },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        cost: true,
        category: true,
        status: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
    const fieldsByProductId = await getProductJsonFields(addons.map(({ id }) => id));
    const inventoryById = await getRecipeInventory(fieldsByProductId);
    const applicableIds = [...new Set(
      [...fieldsByProductId.values()].flatMap(({ applicableProductIds }) => applicableProductIds)
    )];
    const menuProducts = applicableIds.length
      ? await prisma.product.findMany({
          where: {
            productType: "menu_item",
            id: { in: applicableIds },
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

    const result = addons.map((addon) => {
      const fields = fieldsByProductId.get(addon.id) || {
        ingredients: [],
        applicableProductIds: [],
      };
      const inventoryComponents = toInventoryComponents(fields.ingredients, inventoryById);
      const isStockAvailable = inventoryComponents.every(
        (component) => component.stock_quantity >= component.quantity
      );
      const applicableIdSet = new Set(fields.applicableProductIds);
      const products = menuProducts
        .filter((product) => !applicableIdSet.size || applicableIdSet.has(product.id))
        .map((product) => ({ menu_id: product.id, product_name: product.name }));

      return {
        id: addon.id,
        name: addon.name,
        description: addon.description,
        price: Number(addon.price),
        cost: Number(addon.cost ?? 0),
        category: addon.category,
        status: addon.status === "unavailable" || !isStockAvailable
          ? "unavailable"
          : "available",
        created_at: addon.createdAt,
        is_stock_available: isStockAvailable,
        inventory_components: inventoryComponents,
        products,
      };
    });

    res.json({ addons: result });
  } catch (err) {
    next(err);
  }
};

export const createAddon = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, description, price, cost, category, status, inventory_components, product_ids } = req.body || {};
    if (!name || price === undefined) {
      return res.status(400).json({ error: "Add-On name and price are required." });
    }

    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO add_ons (name, description, price, cost, category, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description || null, Number(price), Number(cost || 0), category || 'General Add-On', status || 'available']
    );
    const addon = rows[0];

    // Insert linked inventory components
    if (Array.isArray(inventory_components)) {
      for (const comp of inventory_components) {
        if (comp.inventory_id && comp.quantity > 0) {
          await client.query(
            `INSERT INTO addon_inventory (addon_id, inventory_id, quantity, unit)
             VALUES ($1, $2, $3, $4)`,
            [addon.id, comp.inventory_id, comp.quantity, comp.unit || 'g']
          );
        }
      }
    }

    // Insert applicable products
    if (Array.isArray(product_ids)) {
      for (const menuId of product_ids) {
        await client.query(
          `INSERT INTO addon_products (addon_id, menu_id) VALUES ($1, $2)`,
          [addon.id, menuId]
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ addon });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
};

export const updateAddon = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { name, description, price, cost, category, status, inventory_components, product_ids } = req.body || {};

    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE add_ons
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           cost = COALESCE($4, cost),
           category = COALESCE($5, category),
           status = COALESCE($6, status)
       WHERE id = $7
       RETURNING *`,
      [name, description, price !== undefined ? Number(price) : undefined, cost !== undefined ? Number(cost) : undefined, category, status, id]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Add-On not found." });
    }

    // Re-create inventory components if supplied
    if (Array.isArray(inventory_components)) {
      await client.query(`DELETE FROM addon_inventory WHERE addon_id = $1`, [id]);
      for (const comp of inventory_components) {
        if (comp.inventory_id && comp.quantity > 0) {
          await client.query(
            `INSERT INTO addon_inventory (addon_id, inventory_id, quantity, unit) VALUES ($1, $2, $3, $4)`,
            [id, comp.inventory_id, comp.quantity, comp.unit || 'g']
          );
        }
      }
    }

    // Re-create product links if supplied
    if (Array.isArray(product_ids)) {
      await client.query(`DELETE FROM addon_products WHERE addon_id = $1`, [id]);
      for (const menuId of product_ids) {
        await client.query(
          `INSERT INTO addon_products (addon_id, menu_id) VALUES ($1, $2)`,
          [id, menuId]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ addon: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
};

export const deleteAddon = async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM add_ons WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Add-On not found." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// --- BUNDLES ---

export const listBundles = async (req, res, next) => {
  try {
    const { rows: bundles } = await pool.query(
      `SELECT id, name, description, bundle_price, discount_percent, image_url, status, created_at FROM bundles ORDER BY name ASC`
    );

    const result = await Promise.all(
      bundles.map(async (bundle) => {
        // Linked products
        const { rows: prods } = await pool.query(
          `SELECT bundle_products.id, bundle_products.menu_id, bundle_products.quantity, menu_items.name AS product_name, menu_items.price, menu_items.status AS product_status, menu_items.stock_quantity
           FROM bundle_products
           JOIN menu_items ON menu_items.id = bundle_products.menu_id
           WHERE bundle_products.bundle_id = $1`,
          [bundle.id]
        );

        let regularTotal = 0;
        let isStockAvailable = true;

        prods.forEach(p => {
          regularTotal += Number(p.price) * Number(p.quantity);
          if (p.product_status !== 'available' || (p.stock_quantity !== null && Number(p.stock_quantity) < Number(p.quantity))) {
            isStockAvailable = false;
          }
        });

        const savings = Math.max(0, regularTotal - Number(bundle.bundle_price));
        const computedStatus = (bundle.status === 'unavailable' || !isStockAvailable) ? 'unavailable' : 'available';

        return {
          ...bundle,
          status: computedStatus,
          is_stock_available: isStockAvailable,
          regular_total: regularTotal,
          savings: savings,
          products: prods,
        };
      })
    );

    res.json({ bundles: result });
  } catch (err) {
    next(err);
  }
};

export const createBundle = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, description, bundle_price, discount_percent, image_url, status, products } = req.body || {};
    if (!name || bundle_price === undefined) {
      return res.status(400).json({ error: "Bundle name and bundle_price are required." });
    }

    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO bundles (name, description, bundle_price, discount_percent, image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description || null, Number(bundle_price), Number(discount_percent || 0), image_url || null, status || 'available']
    );
    const bundle = rows[0];

    if (Array.isArray(products)) {
      for (const p of products) {
        if (p.menu_id && p.quantity > 0) {
          await client.query(
            `INSERT INTO bundle_products (bundle_id, menu_id, quantity) VALUES ($1, $2, $3)`,
            [bundle.id, p.menu_id, Number(p.quantity)]
          );
        }
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ bundle });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
};

export const updateBundle = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { name, description, bundle_price, discount_percent, image_url, status, products } = req.body || {};

    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE bundles
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           bundle_price = COALESCE($3, bundle_price),
           discount_percent = COALESCE($4, discount_percent),
           image_url = COALESCE($5, image_url),
           status = COALESCE($6, status)
       WHERE id = $7
       RETURNING *`,
      [name, description, bundle_price !== undefined ? Number(bundle_price) : undefined, discount_percent !== undefined ? Number(discount_percent) : undefined, image_url, status, id]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Bundle not found." });
    }

    if (Array.isArray(products)) {
      await client.query(`DELETE FROM bundle_products WHERE bundle_id = $1`, [id]);
      for (const p of products) {
        if (p.menu_id && p.quantity > 0) {
          await client.query(
            `INSERT INTO bundle_products (bundle_id, menu_id, quantity) VALUES ($1, $2, $3)`,
            [id, p.menu_id, Number(p.quantity)]
          );
        }
      }
    }

    await client.query("COMMIT");
    res.json({ bundle: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
};

export const deleteBundle = async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM bundles WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Bundle not found." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};