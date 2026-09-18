CREATE TABLE "inventory_incidents" (
    "id" SERIAL NOT NULL,
    "inventory_id" INTEGER NOT NULL,
    "staff_id" INTEGER,
    "incident_type" VARCHAR(20) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "location" VARCHAR(150),
    "reference_number" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_incidents_incident_type_check" CHECK ("incident_type" IN ('spoilage', 'theft')),
    CONSTRAINT "inventory_incidents_quantity_check" CHECK ("quantity" > 0)
);

CREATE INDEX "inventory_incidents_occurred_at_idx" ON "inventory_incidents"("occurred_at");

ALTER TABLE "inventory_incidents" ADD CONSTRAINT "inventory_incidents_inventory_id_fkey"
  FOREIGN KEY ("inventory_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_incidents" ADD CONSTRAINT "inventory_incidents_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
