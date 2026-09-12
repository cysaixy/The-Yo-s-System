-- ============================================================
-- Recipe-based inventory tracking
-- ============================================================
-- Adds a tracking_mode to menu_items so the system knows whether a
-- product's available quantity is:
--   'recipe' — derived live from linked ingredients (menu_item_inventory)
--   'direct' — menu_items.stock_quantity is authoritative (pre-packaged goods)
--   'none'   — not stock-tracked at all (always orderable while status = 'available')
--
-- Also lets Purchases (stock_in) restock a raw ingredient directly,
-- instead of only ever restocking a finished menu item.
-- ============================================================

-- --------------------------------------------------------------
-- 1. menu_items.tracking_mode
-- --------------------------------------------------------------
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS tracking_mode VARCHAR(10) NOT NULL DEFAULT 'direct';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'menu_items_tracking_mode_chk'
      AND conrelid = 'menu_items'::regclass
  ) THEN
    ALTER TABLE menu_items
      ADD CONSTRAINT menu_items_tracking_mode_chk
      CHECK (tracking_mode IN ('recipe', 'direct', 'none'));
  END IF;
END $$;

-- Any menu item that already has ingredient links is clearly meant to be
-- recipe-tracked, so backfill it automatically rather than leaving it on
-- the 'direct' default and creating a silent inconsistency.
UPDATE menu_items mi
SET tracking_mode = 'recipe'
WHERE EXISTS (
  SELECT 1 FROM menu_item_inventory mii WHERE mii.menu_id = mi.id
);

-- --------------------------------------------------------------
-- 2. stock_in.inventory_id — purchases can now target a raw ingredient
-- --------------------------------------------------------------
ALTER TABLE stock_in
  ADD COLUMN IF NOT EXISTS inventory_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL;

-- menu_id was NOT NULL under the old "purchases always restock a finished
-- product" model. It must become optional so a purchase can target
-- inventory_id instead.
ALTER TABLE stock_in
  ALTER COLUMN menu_id DROP NOT NULL;

-- Exactly one target per purchase row — never both, never neither.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_in_one_target_chk'
      AND conrelid = 'stock_in'::regclass
  ) THEN
    ALTER TABLE stock_in
      ADD CONSTRAINT stock_in_one_target_chk
      CHECK (
        (menu_id IS NOT NULL AND inventory_id IS NULL) OR
        (menu_id IS NULL AND inventory_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stock_in_inventory_id_idx ON stock_in(inventory_id);

-- --------------------------------------------------------------
-- Verification (safe to run manually after applying)
-- --------------------------------------------------------------
-- SELECT id, name, tracking_mode FROM menu_items ORDER BY name;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'menu_items'::regclass OR conrelid = 'stock_in'::regclass;