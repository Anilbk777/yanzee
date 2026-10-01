/*
  Warnings:

  - Changed the type of `size` on the `order_items` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `size` on the `product_variants` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ProductAudience" AS ENUM ('MEN', 'WOMEN', 'UNISEX', 'BOY', 'GIRL', 'KIDS_UNISEX');

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "size",
ADD COLUMN     "size" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "size",
ADD COLUMN     "size" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "audience" "ProductAudience" NOT NULL DEFAULT 'UNISEX';

-- DropEnum
DROP TYPE "Size";

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_size_key" ON "product_variants"("product_id", "size");
