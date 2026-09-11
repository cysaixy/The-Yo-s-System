import { Prisma } from '@prisma/client';
import prisma from './prisma.js';

const columnCacheKey = Symbol.for('the-yos.product-json-columns');

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeIngredients(value) {
  return normalizeArray(value).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];

    const inventoryId = Number(entry.inventory_id ?? entry.inventoryId);
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) return [];

    const quantity = Number(entry.quantity);
    return [{
      inventoryId,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      unit: entry.unit ?? null,
    }];
  });
}

function normalizeApplicableProductIds(value) {
  return [...new Set(
    normalizeArray(value)
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
}

async function getProductJsonColumns() {
  if (!globalThis[columnCacheKey]) {
    globalThis[columnCacheKey] = prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'products'
        AND column_name IN ('ingredients', 'applicable_product_ids')
    `.then((rows) => new Set(rows.map((row) => row.column_name)));
  }

  return globalThis[columnCacheKey];
}

export async function getProductJsonFields(productIds) {
  const ids = [...new Set(
    productIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
  const fieldsByProductId = new Map(
    ids.map((id) => [id, { ingredients: [], applicableProductIds: [] }])
  );
  if (!ids.length) return fieldsByProductId;

  const columns = await getProductJsonColumns();
  const hasIngredients = columns.has('ingredients');
  const hasApplicableProductIds = columns.has('applicable_product_ids');
  if (!hasIngredients && !hasApplicableProductIds) return fieldsByProductId;

  let rows;
  if (hasIngredients && hasApplicableProductIds) {
    rows = await prisma.$queryRaw`
      SELECT id, ingredients, applicable_product_ids AS "applicableProductIds"
      FROM public.products
      WHERE id IN (${Prisma.join(ids)})
    `;
  } else if (hasIngredients) {
    rows = await prisma.$queryRaw`
      SELECT id, ingredients
      FROM public.products
      WHERE id IN (${Prisma.join(ids)})
    `;
  } else {
    rows = await prisma.$queryRaw`
      SELECT id, applicable_product_ids AS "applicableProductIds"
      FROM public.products
      WHERE id IN (${Prisma.join(ids)})
    `;
  }

  for (const row of rows) {
    fieldsByProductId.set(Number(row.id), {
      ingredients: normalizeIngredients(row.ingredients),
      applicableProductIds: normalizeApplicableProductIds(row.applicableProductIds),
    });
  }

  return fieldsByProductId;
}

export async function getRecipeInventory(fieldsByProductId) {
  const inventoryIds = [...new Set(
    [...fieldsByProductId.values()].flatMap(({ ingredients }) =>
      ingredients.map(({ inventoryId }) => inventoryId)
    )
  )];
  if (!inventoryIds.length) return new Map();

  const inventory = await prisma.inventory.findMany({
    where: { id: { in: inventoryIds } },
    select: { id: true, name: true, stockQuantity: true, unit: true },
  });

  return new Map(inventory.map((item) => [item.id, item]));
}

export function toInventoryComponents(ingredients, inventoryById) {
  return ingredients.map((ingredient) => {
    const inventory = inventoryById.get(ingredient.inventoryId);
    return {
      inventory_id: ingredient.inventoryId,
      quantity: ingredient.quantity,
      unit: ingredient.unit ?? inventory?.unit ?? null,
      inventory_name: inventory?.name ?? null,
      stock_quantity: Number(inventory?.stockQuantity ?? 0),
    };
  });
}
