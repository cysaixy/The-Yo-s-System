import express from 'express';
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
  getItemCapacity,
  getBulkCapacity,
} from '../../controllers/admin/productsController.js';
import { requireStaffAuth } from '../../middlewares/auth.middleware.js';
import { requireAdmin } from '../../middlewares/role.middleware.js';
import { uploadProductImage } from '../../controllers/admin/uploadsController.js';
import { validateRecipeUnits } from '../../middlewares/unitValidation.middleware.js';

const productrouter = express.Router();

productrouter.use(requireStaffAuth);

// --- Staff / POS Read Access ---
productrouter.get('/categories', listCategories);
productrouter.get('/menuitems', listAllMenuItems);
productrouter.get('/menuitems/:id', getMenuItem);
productrouter.get('/addons', listAddons);
productrouter.get('/bundles', listBundles);

// --- Capacity Calculation (Staff Read Access) ---
productrouter.get('/capacity/:id', getItemCapacity);
productrouter.post('/capacity/bulk', getBulkCapacity);

// --- Admin Only Category Management ---
productrouter.post('/categories', requireAdmin, createCategory);
productrouter.patch('/categories/:id', requireAdmin, updateCategory);
productrouter.delete('/categories/:id', requireAdmin, deleteCategory);

// --- Admin Only Menu Item Management ---
productrouter.post('/uploads/product-image', requireAdmin, uploadProductImage);
productrouter.post('/menuitems', requireAdmin, validateRecipeUnits, createMenuItem);
productrouter.patch('/menuitems/:id', requireAdmin, validateRecipeUnits, updateMenuItem);
productrouter.delete('/menuitems/:id', requireAdmin, deleteMenuItem);

// --- Admin Only Add-Ons Management ---
productrouter.post('/addons', requireAdmin, validateRecipeUnits, createAddon);
productrouter.patch('/addons/:id', requireAdmin, validateRecipeUnits, updateAddon);
productrouter.delete('/addons/:id', requireAdmin, deleteAddon);

// --- Admin Only Bundles Management ---
productrouter.post('/bundles', requireAdmin, createBundle);
productrouter.patch('/bundles/:id', requireAdmin, updateBundle);
productrouter.delete('/bundles/:id', requireAdmin, deleteBundle);

export default productrouter;
