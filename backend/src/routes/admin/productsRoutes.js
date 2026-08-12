import express from "express";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listAllMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  listAddons,
  createAddon,
  updateAddon,
  deleteAddon,
  listBundles,
  createBundle,
  updateBundle,
  deleteBundle,
} from "../../controllers/admin/productsController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
import { requireAdmin } from "../../middlewares/role.middleware.js";

const productrouter = express.Router();

productrouter.use(requireStaffAuth);

// --- Staff / POS Read Access ---
productrouter.get("/categories", listCategories);
productrouter.get("/menuitems", listAllMenuItems);
productrouter.get("/menuitems/:id", getMenuItem);
productrouter.get("/addons", listAddons);
productrouter.get("/bundles", listBundles);

// --- Admin Only Category Management ---
productrouter.post("/categories", requireAdmin, createCategory);
productrouter.patch("/categories/:id", requireAdmin, updateCategory);
productrouter.delete("/categories/:id", requireAdmin, deleteCategory);

// --- Admin Only Menu Item Management ---
productrouter.post("/menuitems", requireAdmin, createMenuItem);
productrouter.patch("/menuitems/:id", requireAdmin, updateMenuItem);
productrouter.delete("/menuitems/:id", requireAdmin, deleteMenuItem);

// --- Admin Only Add-Ons Management ---
productrouter.post("/addons", requireAdmin, createAddon);
productrouter.patch("/addons/:id", requireAdmin, updateAddon);
productrouter.delete("/addons/:id", requireAdmin, deleteAddon);

// --- Admin Only Bundles Management ---
productrouter.post("/bundles", requireAdmin, createBundle);
productrouter.patch("/bundles/:id", requireAdmin, updateBundle);
productrouter.delete("/bundles/:id", requireAdmin, deleteBundle);

export default productrouter;