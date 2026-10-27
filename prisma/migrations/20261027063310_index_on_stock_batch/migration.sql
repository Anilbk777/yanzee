-- DropIndex
DROP INDEX "stock_batches_movement_id_idx";

-- CreateIndex
CREATE INDEX "stock_batches_store_id_product_id_variant_id_created_at_idx" ON "stock_batches"("store_id", "product_id", "variant_id", "created_at");
