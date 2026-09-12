// src/middlewares/unitValidation.middleware.js
import { validateAndNormalize, isValidUnit, getBaseUnit } from '../services/unitConversionService.js';

/**
 * Middleware to validate and normalize units in inventory operations.
 * Automatically converts quantities to base units (g, ml, pcs).
 */

/**
 * Validate and normalize inventory item data.
 * Converts quantity and unit to base units before saving.
 */
export function validateInventoryUnits(req, res, next) {
  const { stock_quantity, unit } = req.body || {};

  // Skip validation if neither field is provided (e.g., partial updates)
  if (stock_quantity === undefined && unit === undefined) {
    return next();
  }

  // Both must be provided together
  if (stock_quantity !== undefined && !unit) {
    return res.status(400).json({
      error: 'Unit is required when specifying stock_quantity',
    });
  }

  if (unit && !isValidUnit(unit)) {
    return res.status(400).json({
      error: `Invalid unit: ${unit}. Use valid units like g, kg, ml, L, or pcs.`,
    });
  }

  // Normalize to base unit
  const normalized = validateAndNormalize({
    quantity: stock_quantity || 0,
    unit: unit || 'pcs',
  });

  if (normalized.error && !normalized.originalQuantity) {
    // Hard error - invalid unit
    return res.status(400).json({
      error: normalized.error,
    });
  }

  // Update request body with normalized values
  req.body.stock_quantity = normalized.quantity;
  req.body.unit = normalized.unit;

  // Store original values for logging/response if conversion occurred
  if (normalized.originalQuantity) {
    req.body._conversion = {
      from: `${normalized.originalQuantity} ${normalized.originalUnit}`,
      to: `${normalized.quantity} ${normalized.unit}`,
    };
  }

  next();
}

/**
 * Validate recipe ingredient units.
 * Used for menu_item_inventory and addon_inventory.
 */
export function validateRecipeUnits(req, res, next) {
  const { inventory_components } = req.body || {};

  if (!Array.isArray(inventory_components)) {
    return next();
  }

  const errors = [];
  const normalized = [];

  for (let i = 0; i < inventory_components.length; i++) {
    const comp = inventory_components[i];

    if (!comp.quantity || !comp.unit) {
      errors.push(`Component ${i + 1}: Both quantity and unit are required`);
      continue;
    }

    if (!isValidUnit(comp.unit)) {
      errors.push(`Component ${i + 1}: Invalid unit '${comp.unit}'`);
      continue;
    }

    const result = validateAndNormalize({
      quantity: comp.quantity,
      unit: comp.unit,
    });

    if (result.error && !result.originalQuantity) {
      errors.push(`Component ${i + 1}: ${result.error}`);
      continue;
    }

    normalized.push({
      ...comp,
      quantity: result.quantity,
      unit: result.unit,
      _converted: result.originalQuantity ? {
        from: `${result.originalQuantity} ${result.originalUnit}`,
        to: `${result.quantity} ${result.unit}`,
      } : undefined,
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Recipe validation failed',
      details: errors,
    });
  }

  // Replace with normalized components
  req.body.inventory_components = normalized;

  next();
}

/**
 * Validate purchase/stock-in units.
 */
export function validatePurchaseUnits(req, res, next) {
  const { quantity, unit } = req.body || {};

  // For purchases, unit might be omitted if it's a direct menu_id purchase (legacy)
  // Only validate if unit is provided
  if (!unit) {
    return next();
  }

  if (!isValidUnit(unit)) {
    return res.status(400).json({
      error: `Invalid unit: ${unit}. Use valid units like g, kg, ml, L, or pcs.`,
    });
  }

  const baseUnit = getBaseUnit(unit);

  // For purchases, we might want to accept input in any unit but log the base unit
  // The actual conversion happens at the inventory_items level
  req.body._baseUnit = baseUnit;

  next();
}

/**
 * Helper to get validation summary for response.
 */
export function getConversionSummary(req) {
  const conversions = [];

  if (req.body._conversion) {
    conversions.push({
      field: 'stock_quantity',
      ...req.body._conversion,
    });
  }

  if (req.body.inventory_components) {
    req.body.inventory_components.forEach((comp, i) => {
      if (comp._converted) {
        conversions.push({
          field: `inventory_component[${i}]`,
          ...comp._converted,
        });
      }
    });
  }

  return conversions.length > 0 ? { conversions } : null;
}
