// src/services/unitConversionService.js

/**
 * Unit conversion and validation service.
 * Enforces canonical base units: g (grams), ml (milliliters), pcs (pieces)
 * Prevents mixed units like kg/g or L/ml in the database.
 */

// Canonical base units
const BASE_UNITS = {
  WEIGHT: 'g',      // grams
  VOLUME: 'ml',     // milliliters
  COUNT: 'pcs',     // pieces/units
};

// Valid unit aliases and their base unit conversions
const UNIT_CONVERSIONS = {
  // Weight units
  'g': { base: 'g', multiplier: 1, type: 'weight' },
  'gram': { base: 'g', multiplier: 1, type: 'weight' },
  'grams': { base: 'g', multiplier: 1, type: 'weight' },
  'kg': { base: 'g', multiplier: 1000, type: 'weight' },
  'kilogram': { base: 'g', multiplier: 1000, type: 'weight' },
  'kilograms': { base: 'g', multiplier: 1000, type: 'weight' },
  'mg': { base: 'g', multiplier: 0.001, type: 'weight' },
  'milligram': { base: 'g', multiplier: 0.001, type: 'weight' },
  'milligrams': { base: 'g', multiplier: 0.001, type: 'weight' },
  'oz': { base: 'g', multiplier: 28.35, type: 'weight' },
  'ounce': { base: 'g', multiplier: 28.35, type: 'weight' },
  'ounces': { base: 'g', multiplier: 28.35, type: 'weight' },
  'lb': { base: 'g', multiplier: 453.592, type: 'weight' },
  'pound': { base: 'g', multiplier: 453.592, type: 'weight' },
  'pounds': { base: 'g', multiplier: 453.592, type: 'weight' },

  // Volume units
  'ml': { base: 'ml', multiplier: 1, type: 'volume' },
  'milliliter': { base: 'ml', multiplier: 1, type: 'volume' },
  'milliliters': { base: 'ml', multiplier: 1, type: 'volume' },
  'l': { base: 'ml', multiplier: 1000, type: 'volume' },
  'liter': { base: 'ml', multiplier: 1000, type: 'volume' },
  'liters': { base: 'ml', multiplier: 1000, type: 'volume' },
  'cl': { base: 'ml', multiplier: 10, type: 'volume' },
  'centiliter': { base: 'ml', multiplier: 10, type: 'volume' },
  'centiliters': { base: 'ml', multiplier: 10, type: 'volume' },
  'dl': { base: 'ml', multiplier: 100, type: 'volume' },
  'deciliter': { base: 'ml', multiplier: 100, type: 'volume' },
  'deciliters': { base: 'ml', multiplier: 100, type: 'volume' },
  'fl oz': { base: 'ml', multiplier: 29.574, type: 'volume' },
  'cup': { base: 'ml', multiplier: 236.588, type: 'volume' },
  'cups': { base: 'ml', multiplier: 236.588, type: 'volume' },
  'tbsp': { base: 'ml', multiplier: 14.787, type: 'volume' },
  'tablespoon': { base: 'ml', multiplier: 14.787, type: 'volume' },
  'tablespoons': { base: 'ml', multiplier: 14.787, type: 'volume' },
  'tsp': { base: 'ml', multiplier: 4.929, type: 'volume' },
  'teaspoon': { base: 'ml', multiplier: 4.929, type: 'volume' },
  'teaspoons': { base: 'ml', multiplier: 4.929, type: 'volume' },

  // Count units
  'pcs': { base: 'pcs', multiplier: 1, type: 'count' },
  'pc': { base: 'pcs', multiplier: 1, type: 'count' },
  'piece': { base: 'pcs', multiplier: 1, type: 'count' },
  'pieces': { base: 'pcs', multiplier: 1, type: 'count' },
  'unit': { base: 'pcs', multiplier: 1, type: 'count' },
  'units': { base: 'pcs', multiplier: 1, type: 'count' },
  'item': { base: 'pcs', multiplier: 1, type: 'count' },
  'items': { base: 'pcs', multiplier: 1, type: 'count' },
  'ea': { base: 'pcs', multiplier: 1, type: 'count' },
  'each': { base: 'pcs', multiplier: 1, type: 'count' },
  'bottle': { base: 'pcs', multiplier: 1, type: 'count' },
  'bottles': { base: 'pcs', multiplier: 1, type: 'count' },
  'box': { base: 'pcs', multiplier: 1, type: 'count' },
  'boxes': { base: 'pcs', multiplier: 1, type: 'count' },
  'bag': { base: 'pcs', multiplier: 1, type: 'count' },
  'bags': { base: 'pcs', multiplier: 1, type: 'count' },
  'pack': { base: 'pcs', multiplier: 1, type: 'count' },
  'packs': { base: 'pcs', multiplier: 1, type: 'count' },
};

/**
 * Normalize a unit string to lowercase without extra spaces.
 */
function normalizeUnit(unit) {
  return String(unit || '').toLowerCase().trim();
}

/**
 * Check if a unit is valid.
 * @param {string} unit - Unit to validate
 * @returns {boolean}
 */
export function isValidUnit(unit) {
  return UNIT_CONVERSIONS.hasOwnProperty(normalizeUnit(unit));
}

/**
 * Get the base unit for a given unit.
 * @param {string} unit - Unit to convert
 * @returns {string|null} - Base unit (g, ml, pcs) or null if invalid
 */
export function getBaseUnit(unit) {
  const normalized = normalizeUnit(unit);
  const conversion = UNIT_CONVERSIONS[normalized];
  return conversion ? conversion.base : null;
}

/**
 * Get the unit type (weight, volume, count).
 * @param {string} unit - Unit to check
 * @returns {string|null} - Type or null if invalid
 */
export function getUnitType(unit) {
  const normalized = normalizeUnit(unit);
  const conversion = UNIT_CONVERSIONS[normalized];
  return conversion ? conversion.type : null;
}

/**
 * Convert a quantity from one unit to the base unit.
 * @param {number} quantity - Amount to convert
 * @param {string} fromUnit - Source unit
 * @returns {{quantity: number, unit: string, error?: string}}
 */
export function convertToBaseUnit(quantity, fromUnit) {
  const normalized = normalizeUnit(fromUnit);
  const conversion = UNIT_CONVERSIONS[normalized];

  if (!conversion) {
    return {
      quantity: 0,
      unit: 'pcs',
      error: `Invalid unit: ${fromUnit}`,
    };
  }

  const baseQuantity = Number(quantity) * conversion.multiplier;

  return {
    quantity: baseQuantity,
    unit: conversion.base,
  };
}

/**
 * Convert a quantity from base unit to a display unit.
 * @param {number} baseQuantity - Amount in base unit
 * @param {string} baseUnit - Base unit (g, ml, pcs)
 * @param {string} toUnit - Target display unit
 * @returns {{quantity: number, unit: string, error?: string}}
 */
export function convertFromBaseUnit(baseQuantity, baseUnit, toUnit) {
  const normalizedTo = normalizeUnit(toUnit);
  const conversion = UNIT_CONVERSIONS[normalizedTo];

  if (!conversion) {
    return {
      quantity: baseQuantity,
      unit: baseUnit,
      error: `Invalid target unit: ${toUnit}`,
    };
  }

  if (conversion.base !== baseUnit) {
    return {
      quantity: baseQuantity,
      unit: baseUnit,
      error: `Unit type mismatch: cannot convert ${baseUnit} to ${toUnit}`,
    };
  }

  const displayQuantity = Number(baseQuantity) / conversion.multiplier;

  return {
    quantity: displayQuantity,
    unit: normalizedTo,
  };
}

/**
 * Check if two units are compatible (same type).
 * @param {string} unit1 - First unit
 * @param {string} unit2 - Second unit
 * @returns {boolean}
 */
export function areUnitsCompatible(unit1, unit2) {
  const type1 = getUnitType(unit1);
  const type2 = getUnitType(unit2);
  return type1 && type2 && type1 === type2;
}

/**
 * Validate and normalize ingredient/inventory data to use base units.
 * @param {object} data - Object with quantity and unit
 * @returns {{quantity: number, unit: string, originalQuantity?: number, originalUnit?: string, error?: string}}
 */
export function validateAndNormalize(data) {
  const { quantity, unit } = data;

  if (!unit) {
    return {
      quantity: Number(quantity) || 0,
      unit: 'pcs',
      error: 'Missing unit - defaulting to pcs',
    };
  }

  const conversion = convertToBaseUnit(quantity, unit);

  if (conversion.error) {
    return {
      quantity: Number(quantity) || 0,
      unit: 'pcs',
      originalQuantity: quantity,
      originalUnit: unit,
      error: conversion.error,
    };
  }

  // If already in base unit, no conversion needed
  const normalized = normalizeUnit(unit);
  const unitInfo = UNIT_CONVERSIONS[normalized];

  if (unitInfo.base === normalized) {
    return {
      quantity: Number(quantity) || 0,
      unit: unitInfo.base,
    };
  }

  // Converted from non-base unit
  return {
    quantity: conversion.quantity,
    unit: conversion.unit,
    originalQuantity: quantity,
    originalUnit: unit,
  };
}

/**
 * Format a quantity with appropriate unit for display.
 * Automatically uses larger units (kg, L) for large quantities.
 * @param {number} quantity - Amount in base unit
 * @param {string} baseUnit - Base unit (g, ml, pcs)
 * @returns {string} - Formatted string like "2.5 kg" or "500 ml"
 */
export function formatQuantity(quantity, baseUnit) {
  const num = Number(quantity) || 0;

  switch (baseUnit) {
    case 'g':
      if (num >= 1000) {
        return `${(num / 1000).toFixed(2)} kg`;
      }
      return `${num.toFixed(2)} g`;

    case 'ml':
      if (num >= 1000) {
        return `${(num / 1000).toFixed(2)} L`;
      }
      return `${num.toFixed(2)} ml`;

    case 'pcs':
      return `${Math.floor(num)} pcs`;

    default:
      return `${num.toFixed(2)} ${baseUnit}`;
  }
}

/**
 * Get a list of all valid units for a specific type.
 * @param {string} type - 'weight', 'volume', or 'count'
 * @returns {string[]} - Array of valid unit strings
 */
export function getValidUnitsForType(type) {
  return Object.keys(UNIT_CONVERSIONS)
    .filter(unit => UNIT_CONVERSIONS[unit].type === type);
}

/**
 * Get suggested base unit based on inventory category.
 * @param {string} category - Inventory category name
 * @returns {string} - Suggested base unit
 */
export function suggestUnitForCategory(category) {
  const cat = String(category || '').toLowerCase();

  // Weight-based categories
  if (cat.includes('bean') || cat.includes('powder') || cat.includes('sugar') || 
      cat.includes('flour') || cat.includes('spice')) {
    return 'g';
  }

  // Volume-based categories
  if (cat.includes('milk') || cat.includes('syrup') || cat.includes('sauce') || 
      cat.includes('juice') || cat.includes('water') || cat.includes('liquid')) {
    return 'ml';
  }

  // Count-based categories
  if (cat.includes('cup') || cat.includes('lid') || cat.includes('packaging') || 
      cat.includes('bottle') || cat.includes('bag')) {
    return 'pcs';
  }

  // Default to pieces for uncategorized items
  return 'pcs';
}

export default {
  BASE_UNITS,
  isValidUnit,
  getBaseUnit,
  getUnitType,
  convertToBaseUnit,
  convertFromBaseUnit,
  areUnitsCompatible,
  validateAndNormalize,
  formatQuantity,
  getValidUnitsForType,
  suggestUnitForCategory,
};
