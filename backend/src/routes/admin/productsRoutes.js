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
} from "../../controllers/admin/productsController.js";
//import { requireAdmin } from "../../middleware/auth.js"; // Adjust import path to your middleware

const productrouter = express.Router();

// --- Staff / POS Read Access ---
productrouter.get("/categories", listCategories);
productrouter.get("/menuitems", listAllMenuItems);
productrouter.get("/menuitems/:id", getMenuItem);

// --- Admin Only Category Management ---
//productrouter.post("/categories", requireAdmin, createCategory);
//productrouter.patch("/categories/:id", requireAdmin, updateCategory);
//productrouter.delete("/categories/:id", requireAdmin, deleteCategory);

// --- Admin Only Menu Item Management ---
//productrouter.post("/menuitems", requireAdmin, createMenuItem);
//productrouter.patch("/menuitems/:id", requireAdmin, updateMenuItem);
//productrouter.delete("/menuitems/:id", requireAdmin, deleteMenuItem);

export default productrouter;