-- Track the staff member who accepted or is actively handling an order
-- without changing staff_id, which identifies the order's original creator/source.
-- status_updated_at lets the live feed retain recent terminal transitions.
ALTER TABLE "orders"
ADD COLUMN "handled_by_staff_id" INTEGER,
ADD COLUMN "status_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "orders"
ADD CONSTRAINT "orders_handled_by_staff_id_fkey"
FOREIGN KEY ("handled_by_staff_id") REFERENCES "staff"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "orders_handled_by_staff_id_idx"
ON "orders"("handled_by_staff_id");
