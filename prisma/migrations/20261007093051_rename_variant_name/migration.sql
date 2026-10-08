/*
  Warnings:

  - You are about to drop the column `variant_name` on the `product_variants` table. All the data in the column will be lost.
  - Added the required column `name` to the `product_variants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "variant_name",
ADD COLUMN     "name" TEXT NOT NULL;
