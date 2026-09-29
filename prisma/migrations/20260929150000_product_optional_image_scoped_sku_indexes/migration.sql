-- DropIndex
DROP INDEX "product_variants_sku_key";

-- DropIndex
DROP INDEX "products_shop_id_idx";

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "image" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_sku_key" ON "product_variants"("product_id", "sku");

-- CreateIndex
CREATE INDEX "products_shop_id_created_at_idx" ON "products"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "products_shop_id_status_idx" ON "products"("shop_id", "status");
