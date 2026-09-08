// src/controllers/admin/inventoryController.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Helper to calculate stock status
function getStockStatus(stockQuantity, reorderLevel) {
  if (stockQuantity <= 0) return "out_of_stock";
  if (stockQuantity <= reorderLevel) return "below_reorder";
  if (stockQuantity <= reorderLevel * 1.5) return "low_stock";
  return "in_stock";
}

// GET /api/admin/inventory
export async function overview(req, res, next) {
  try {
    let items = await prisma.inventory.findMany({
      where: { itemType: "raw_material" },
      orderBy: { name: "asc" },
    });

    if (items.length === 0) {
      const seedData = [
        { itemType: "raw_material", name: "Espresso Beans", category: "Coffee & Espresso", sku: "COF-001", stockQuantity: 15.0, unit: "kg", unitCost: 850.0, reorderLevel: 3.0, supplier: "ABC Coffee Supplier", notes: "Premium Arabica espresso beans" },
        { itemType: "raw_material", name: "Fresh Milk", category: "Milk & Dairy", sku: "MLK-001", stockQuantity: 24.0, unit: "L", unitCost: 95.0, reorderLevel: 5.0, supplier: "Dairy Fresh Co.", notes: "Whole fresh milk" },
        { itemType: "raw_material", name: "Oat Milk", category: "Non-Dairy & Plant-Based", sku: "MLK-002", stockQuantity: 12.0, unit: "L", unitCost: 150.0, reorderLevel: 4.0, supplier: "OatLy Inc.", notes: "Barista edition oat milk" },
        { itemType: "raw_material", name: "Matcha Powder", category: "Tea & Matcha", sku: "TEA-001", stockQuantity: 2.5, unit: "kg", unitCost: 1200.0, reorderLevel: 1.0, supplier: "Uji Tea Imports", notes: "Ceremonial grade matcha" },
        { itemType: "raw_material", name: "Vanilla Syrup", category: "Syrups & Flavorings", sku: "SYR-001", stockQuantity: 8.0, unit: "bottle", unitCost: 380.0, reorderLevel: 2.0, supplier: "Monin Philippines", notes: "750ml vanilla syrup" },
        { itemType: "raw_material", name: "Caramel Sauce", category: "Sauces & Toppings", sku: "SAU-001", stockQuantity: 5.0, unit: "bottle", unitCost: 420.0, reorderLevel: 2.0, supplier: "Torani Sauces", notes: "Drizzle sauce" },
        { itemType: "raw_material", name: "Brown Sugar", category: "Sweeteners", sku: "SWT-001", stockQuantity: 20.0, unit: "kg", unitCost: 65.0, reorderLevel: 5.0, supplier: "Local Sugar Mill", notes: "Raw brown sugar" },
        { itemType: "raw_material", name: "Paper Cups 16oz", category: "Packaging", sku: "PKG-001", stockQuantity: 500.0, unit: "pcs", unitCost: 4.5, reorderLevel: 100.0, supplier: "EcoPack Corp", notes: "Double wall hot cups" },
        { itemType: "raw_material", name: "Plastic Lids", category: "Packaging", sku: "PKG-002", stockQuantity: 450.0, unit: "pcs", unitCost: 1.8, reorderLevel: 100.0, supplier: "EcoPack Corp", notes: "Sip lids for 16oz" },
      ];
      await prisma.inventory.createMany({ data: seedData });
      items = await prisma.inventory.findMany({ where: { itemType: "raw_material" }, orderBy: { name: "asc" } });
    }

    const itemsWithStatus = items.map((item) => ({ ...item, stock_status: getStockStatus(item.stockQuantity, item.reorderLevel) }));
    res.json({ items: itemsWithStatus });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/inventory/items
export async function createItem(req, res, next) {
  try {
    const { name, category, sku, stock_quantity, unit, unit_cost, reorder_level, supplier, notes } = req.body || {};
    if (!name || !category) return res.status(400).json({ error: "Item name and category are required." });
    
    const stock = Number(stock_quantity || 0);
    const cost = Number(unit_cost || 0);
    const reorder = Number(reorder_level || 5);
    
    const item = await prisma.inventory.create({
      data: {
        itemType: "raw_material",
        name,
        category,
        sku: sku || null,
        stockQuantity: stock,
        unit: unit || "pcs",
        unitCost: cost,
        reorderLevel: reorder,
        supplier: supplier || null,
        status: getStockStatus(stock, reorder),
        notes: notes || null,
      },
    });
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/inventory/items/:id
export async function updateItem(req, res, next) {
  try {
    const { id } = req.params;
    const { name, category, sku, stock_quantity, unit, unit_cost, reorder_level, supplier, notes } = req.body || {};
    
    const current = await prisma.inventory.findUnique({ where: { id: parseInt(id) } });
    if (!current) return res.status(404).json({ error: "Inventory item not found." });
    
    const newStock = stock_quantity !== undefined ? Number(stock_quantity) : Number(current.stockQuantity);
    const newReorder = reorder_level !== undefined ? Number(reorder_level) : Number(current.reorderLevel);
    
    const item = await prisma.inventory.update({
      where: { id: parseInt(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(sku !== undefined && { sku }),
        ...(unit !== undefined && { unit }),
        ...(unit_cost !== undefined && { unitCost: unit_cost }),
        ...(reorder_level !== undefined && { reorderLevel: newReorder }),
        ...(supplier !== undefined && { supplier }),
        ...(notes !== undefined && { notes }),
        ...(stock_quantity !== undefined && { stockQuantity: newStock }),
        status: getStockStatus(newStock, newReorder),
      },
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/inventory/items/:id
export async function deleteItem(req, res, next) {
  try {
    const { id } = req.params;
    const linkedProducts = await prisma.product.findMany({ where: { inventoryLinks: { some: { id: parseInt(id) } } }, select: { name: true } });
    if (linkedProducts.length > 0) {
      return res.status(409).json({
        error: `This inventory item is currently linked to products (${linkedProducts.map((r) => r.name).join(", ")}). Please remove the linkage first or deactivate the item.`,
        linkedProducts,
      });
    }
    await prisma.inventory.delete({ where: { id: parseInt(id) } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/inventory/adjustments
export async function createAdjustment(req, res, next) {
  try {
    const { inventory_id, quantity_change, remarks } = req.body || {};
    if (!inventory_id || quantity_change === undefined) {
      return res.status(400).json({ error: "Item ID and quantity_change are required." });
    }

    const staffId = req.staff?.id ?? null;
    const inventory = await prisma.inventory.findUnique({ where: { id: parseInt(inventory_id) } });
    if (!inventory) return res.status(404).json({ error: "Inventory item not found." });

    const change = Number(quantity_change);
    const newStock = Number(inventory.stockQuantity) + change;
    if (newStock < 0) return res.status(400).json({ error: "Adjustment would result in negative stock." });

    const updatedItem = await prisma.inventory.update({
      where: { id: parseInt(inventory_id) },
      data: {
        stockQuantity: newStock,
        status: getStockStatus(newStock, inventory.reorderLevel ?? 0),
      },
    });

    const transaction = await prisma.inventoryTransaction.create({
      data: {
        inventoryId: parseInt(inventory_id),
        staffId: staffId ?? 0,
        transactionType: "adjustment",
        quantityChange: Number.isInteger(change) ? change : Math.trunc(change),
        remarks: remarks || null,
      },
    });

    return res.status(201).json({ adjustment: transaction, newItem: updatedItem, newStockQuantity: updatedItem.stockQuantity });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/inventory/log
export async function log(req, res, next) {
  try {
    const { inventory_id, staff_id, transaction_type, from, to } = req.query;
    const whereConditions = {};
    if (inventory_id) whereConditions.inventoryId = parseInt(inventory_id);
    if (staff_id) whereConditions.staffId = parseInt(staff_id);
    if (transaction_type) whereConditions.transactionType = transaction_type;
    if (from || to) {
      whereConditions.transactionDate = {};
      if (from) whereConditions.transactionDate.gte = new Date(from + "T00:00:00Z");
      if (to) whereConditions.transactionDate.lte = new Date(to + "T23:59:59Z");
    }
    
    const entries = await prisma.inventoryTransaction.findMany({
      where: whereConditions,
      include: { inventory: { select: { name: true } }, staff: { select: { name: true } } },
      orderBy: { transactionDate: "desc" },
    });
    
    const transformedEntries = entries.map((entry) => ({
      id: entry.id,
      item_name: entry.inventory?.name || "Inventory Item",
      staff_name: entry.staff?.name || null,
      transaction_type: entry.transactionType,
      quantity_change: entry.quantityChange,
      log_date: entry.transactionDate,
      remarks: entry.remarks,
    }));
    res.json({ entries: transformedEntries });
  } catch (err) {
    next(err);
  }
}