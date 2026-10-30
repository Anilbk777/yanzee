-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_variant_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_batches" DROP CONSTRAINT "stock_batches_product_id_store_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_batches" DROP CONSTRAINT "stock_batches_variant_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movement_items" DROP CONSTRAINT "stock_movement_items_product_id_store_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movement_items" DROP CONSTRAINT "stock_movement_items_variant_id_fkey";

-- DropIndex
DROP INDEX "stock_movement_items_batch_id_idx";

-- DropIndex
DROP INDEX "stock_movement_items_movement_id_idx";

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "meta" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "is_available" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: added as NULLABLE first, made NOT NULL after the backfill below
ALTER TABLE "stock_batches"
  ADD COLUMN "meta" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "product_name" TEXT,
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "variant_name" TEXT;

ALTER TABLE "stock_movement_items"
  ADD COLUMN "product_name" TEXT,
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "variant_name" TEXT;

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- ============================================================================
-- BACKFILL (hand-written). Must run BEFORE the SET NOT NULL lines.
-- ============================================================================

-- 1. stock_batches, base product rows (and the product part of variant rows)
UPDATE "stock_batches" b SET
  "product_name" = p."name",
  "sku"          = p."sku",
  "meta" = jsonb_build_object(
    'brandId',      p."brand_id",
    'image',        p."image_urls"[1],
    'size',         NULL,
    'colorCodes',   '[]'::jsonb,
    'sellingPrice', COALESCE(p."selling_price", 0)
  )
FROM "products" p
WHERE p."id" = b."product_id";

-- 2. stock_batches, variant rows: the variant's own name, sku, size, colors, price
UPDATE "stock_batches" b SET
  "variant_name" = v."name",
  "sku"          = v."sku",
  "meta" = jsonb_build_object(
    'brandId',      p."brand_id",
    'image',        p."image_urls"[1],
    'size',         v."size",
    'colorCodes',   COALESCE(to_jsonb(v."color_codes"), '[]'::jsonb),
    'sellingPrice', COALESCE(v."selling_price", p."selling_price", 0)
  )
FROM "product_variants" v, "products" p
WHERE b."variant_id" = v."id"
  AND p."id" = b."product_id";

-- 3. safety net: should match 0 rows, but keeps SET NOT NULL from failing
UPDATE "stock_batches" SET "product_name" = 'Unknown product' WHERE "product_name" IS NULL;

-- 4. stock_movement_items: copy from the batch each line points to
UPDATE "stock_movement_items" i SET
  "product_name" = b."product_name",
  "variant_name" = b."variant_name",
  "sku"          = b."sku"
FROM "stock_batches" b
WHERE b."id" = i."batch_id";

UPDATE "stock_movement_items" SET "product_name" = 'Unknown product' WHERE "product_name" IS NULL;

-- 5. now it is safe
ALTER TABLE "stock_batches"         ALTER COLUMN "product_name" SET NOT NULL;
ALTER TABLE "stock_movement_items"  ALTER COLUMN "product_name" SET NOT NULL;