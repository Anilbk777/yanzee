-- DropIndex
DROP INDEX "orders_coupon_id_customer_phone_idx";

-- DropIndex
DROP INDEX "orders_customer_id_idx";

-- CreateIndex
CREATE INDEX "orders_store_id_created_at_idx" ON "orders"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_store_id_customer_name_idx" ON "orders"("store_id", "customer_name");
