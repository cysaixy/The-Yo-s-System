-- Additive, rerunnable compatibility repair for Prisma product recipe fields.
-- This preserves all existing product rows and bundle composition data.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS applicable_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_ingredients_is_array_chk'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_ingredients_is_array_chk
      CHECK (jsonb_typeof(ingredients) = 'array');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_applicable_product_ids_is_array_chk'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_applicable_product_ids_is_array_chk
      CHECK (jsonb_typeof(applicable_product_ids) = 'array');
  END IF;
END
$$;

COMMIT;

-- Verification: both additive JSONB columns should be non-null with [] defaults.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name IN ('ingredients', 'applicable_product_ids')
ORDER BY column_name;

-- Verification: both array-shape checks should be present on public.products.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.products'::regclass
  AND conname IN (
    'products_ingredients_is_array_chk',
    'products_applicable_product_ids_is_array_chk'
  )
ORDER BY conname;
