/*
  Warnings:

  - You are about to alter the column `quantity_change` on the `inventory_log` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,2)`.
  - You are about to drop the column `delivery_barangay` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `delivery_city` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `delivery_fee_assigned_at` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `delivery_fee_assigned_by` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `delivery_landmark` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `table_time` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the `tables` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "inventory_log" DROP CONSTRAINT "inventory_log_menu_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_log" DROP CONSTRAINT "inventory_log_staff_id_fkey";

-- AlterTable
ALTER TABLE "inventory_log" ADD COLUMN     "inventory_id" INTEGER,
ALTER COLUMN "menu_id" DROP NOT NULL,
ALTER COLUMN "staff_id" DROP NOT NULL,
ALTER COLUMN "quantity_change" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "delivery_barangay",
DROP COLUMN "delivery_city",
DROP COLUMN "delivery_fee_assigned_at",
DROP COLUMN "delivery_fee_assigned_by",
DROP COLUMN "delivery_landmark",
DROP COLUMN "table_time";

-- DropTable
DROP TABLE "tables";

-- CreateIndex
CREATE INDEX "inventory_log_inventory_date_idx" ON "inventory_log"("inventory_id", "log_date");

-- CreateIndex
CREATE INDEX "inventory_log_menu_id_idx" ON "inventory_log"("menu_id");

-- CreateIndex
CREATE INDEX "inventory_log_staff_id_idx" ON "inventory_log"("staff_id");

-- CreateIndex
CREATE INDEX "inventory_log_date_idx" ON "inventory_log"("log_date");

-- CreateIndex
CREATE INDEX "menu_items_category_status_idx" ON "menu_items"("category_id", "status");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_datetime_ordered_idx" ON "orders"("datetime_ordered");

-- CreateIndex
CREATE INDEX "orders_reservation_id_idx" ON "orders"("reservation_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "reservations_customer_id_idx" ON "reservations"("customer_id");

-- CreateIndex
CREATE INDEX "reservations_date_status_idx" ON "reservations"("reservation_date", "status");

-- CreateIndex
CREATE INDEX "reservations_table_date_status_idx" ON "reservations"("table_no", "reservation_date", "status");

-- CreateIndex
CREATE INDEX "reservations_date_idx" ON "reservations"("reservation_date");

-- AddForeignKey
ALTER TABLE "inventory_log" ADD CONSTRAINT "inventory_log_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_log" ADD CONSTRAINT "inventory_log_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_log" ADD CONSTRAINT "inventory_log_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
