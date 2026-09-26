-- Migration: Add flavors column to menu_items
-- Flavors allow products like chicken wings to have selectable flavor options (e.g. Buffalo, Honey Garlic, BBQ).
-- The selected flavor is stored per order item in the notes field.

ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "flavors" TEXT[] NOT NULL DEFAULT '{}';
