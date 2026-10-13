-- DropIndex
DROP INDEX "stock_movements_corrects_movement_id_idx";

-- AlterTable
ALTER TABLE "product_variants" ALTER COLUMN "stock_status" SET DEFAULT 'OUT_OF_STOCK';

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "stock_status" SET DEFAULT 'OUT_OF_STOCK';
