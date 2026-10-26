/*
  Warnings:

  - A unique constraint covering the columns `[store_id,outlet_id,item_key]` on the table `outlet_stocks` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "outlet_stocks_outlet_id_item_key_key";

-- DropIndex
DROP INDEX "product_variants_product_id_idx";

-- DropIndex
DROP INDEX "products_store_id_stock_status_idx";

-- CreateIndex
CREATE UNIQUE INDEX "outlet_stocks_store_id_outlet_id_item_key_key" ON "outlet_stocks"("store_id", "outlet_id", "item_key");

-- CreateIndex
CREATE INDEX "product_variants_store_id_product_id_idx" ON "product_variants"("store_id", "product_id");

-- CreateIndex
CREATE INDEX "products_store_id_stock_status_is_available_has_variants_idx" ON "products"("store_id", "stock_status", "is_available", "has_variants");
