/*
  Warnings:

  - The values [OUT_OF_STOCK] on the enum `ProductStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `stock` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `category_id` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `discount_price` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `gallery` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `products` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[store_id,sku]` on the table `product_variants` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,store_id]` on the table `products` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[store_id,sku]` on the table `products` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `selling_price` to the `product_variants` table without a default value. This is not possible if the table is not empty.
  - Added the required column `store_id` to the `product_variants` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variant_name` to the `product_variants` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProductChannel" AS ENUM ('ALL', 'WEBSITE', 'POS');

-- AlterEnum
BEGIN;
CREATE TYPE "ProductStatus_new" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');
ALTER TABLE "public"."products" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "status" TYPE "ProductStatus_new" USING ("status"::text::"ProductStatus_new");
ALTER TYPE "ProductStatus" RENAME TO "ProductStatus_old";
ALTER TYPE "ProductStatus_new" RENAME TO "ProductStatus";
DROP TYPE "public"."ProductStatus_old";
ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_product_id_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_fkey";

-- DropIndex
DROP INDEX "product_variants_product_id_size_key";

-- DropIndex
DROP INDEX "product_variants_product_id_sku_key";

-- DropIndex
DROP INDEX "products_store_id_category_id_status_idx";

-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "stock",
ADD COLUMN     "alt_barcode" TEXT,
ADD COLUMN     "color_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "cost_price" DECIMAL(12,2),
ADD COLUMN     "crossed_price" DECIMAL(12,2),
ADD COLUMN     "hs_code" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "selling_price" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "store_id" TEXT NOT NULL,
ADD COLUMN     "variant_name" TEXT NOT NULL,
ADD COLUMN     "weight" DECIMAL(8,3),
ALTER COLUMN "size" DROP NOT NULL;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "category_id",
DROP COLUMN "description",
DROP COLUMN "discount_price",
DROP COLUMN "gallery",
DROP COLUMN "image",
DROP COLUMN "price",
ADD COLUMN     "alt_barcode" TEXT,
ADD COLUMN     "channel" "ProductChannel" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "cost_price" DECIMAL(12,2),
ADD COLUMN     "crossed_price" DECIMAL(12,2),
ADD COLUMN     "has_variants" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hs_code" TEXT,
ADD COLUMN     "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "is_available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "long_description" TEXT,
ADD COLUMN     "product_description" TEXT,
ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "release_date" TIMESTAMP(3),
ADD COLUMN     "selling_price" DECIMAL(12,2),
ADD COLUMN     "seo_description" TEXT,
ADD COLUMN     "seo_image" TEXT,
ADD COLUMN     "seo_title" TEXT,
ADD COLUMN     "similar_product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "weight" DECIMAL(8,3);

-- CreateTable
CREATE TABLE "_CategoryToProduct" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CategoryToProduct_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CategoryToProduct_B_index" ON "_CategoryToProduct"("B");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_store_id_sku_key" ON "product_variants"("store_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_id_store_id_key" ON "products"("id", "store_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_sku_key" ON "products"("store_id", "sku");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_store_id_fkey" FOREIGN KEY ("product_id", "store_id") REFERENCES "products"("id", "store_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToProduct" ADD CONSTRAINT "_CategoryToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToProduct" ADD CONSTRAINT "_CategoryToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
