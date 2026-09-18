-- The POS accepts any non-negative delivery fee, including amounts below ₱20.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_delivery_fee_range";
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_delivery_fee_range" CHECK ("delivery_fee" >= 0) NOT VALID;
