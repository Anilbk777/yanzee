-- /*
--   Warnings:

--   - The values [ACCEPTED,DECLINED,READY] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
--   - The values [PENDING,FAILED] on the enum `PaymentStatus` will be removed. If these variants are still used in the database, this will fail.
--   - You are about to drop the column `size` on the `order_items` table. All the data in the column will be lost.
--   - You are about to drop the column `accepted_at` on the `orders` table. All the data in the column will be lost.
--   - You are about to drop the column `courier_name` on the `orders` table. All the data in the column will be lost.
--   - You are about to drop the column `decline_reason` on the `orders` table. All the data in the column will be lost.
--   - You are about to drop the column `delivered_at` on the `orders` table. All the data in the column will be lost.
--   - You are about to drop the column `dispatched_at` on the `orders` table. All the data in the column will be lost.
--   - You are about to drop the column `ready_at` on the `orders` table. All the data in the column will be lost.
--   - You are about to drop the column `review_token` on the `orders` table. All the data in the column will be lost.
--   - You are about to drop the column `shipping_fee` on the `orders` table. All the data in the column will be lost.
--   - You are about to drop the column `tracking_number` on the `orders` table. All the data in the column will be lost.
--   - You are about to drop the column `paid_at` on the `payments` table. All the data in the column will be lost.
--   - You are about to drop the column `transaction_id` on the `payments` table. All the data in the column will be lost.
--   - The `status` column on the `payments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
--   - You are about to drop the `order_status_history` table. If the table is not empty, all the data it contains will be lost.
--   - Added the required column `outlet_id` to the `order_items` table without a default value. This is not possible if the table is not empty.
--   - Made the column `product_id` on table `order_items` required. This step will fail if there are existing NULL values in that column.
--   - Made the column `product_id` on table `reviews` required. This step will fail if there are existing NULL values in that column.

-- */
-- -- CreateEnum
-- CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENT');

-- -- CreateEnum
-- CREATE TYPE "CouponScope" AS ENUM ('ORDER', 'PRODUCT');

-- -- CreateEnum
-- CREATE TYPE "OrderChannel" AS ENUM ('WEBSITE', 'POS', 'ADMIN');

-- -- CreateEnum
-- CREATE TYPE "OrderActivityAction" AS ENUM ('ORDER_CREATED', 'ORDER_EDITED', 'ORDER_STATUS_CHANGED', 'ORDER_NOTE_EDITED', 'ITEMS_EDITED', 'PAYMENT_METHOD_CHANGED', 'PAYMENT_STATUS_CHANGED', 'LABELS_CHANGED', 'DISCOUNT_CHANGED', 'CUSTOMER_NAME_EDITED', 'CUSTOMER_PHONE_EDITED', 'CUSTOMER_EMAIL_EDITED', 'CUSTOMER_ADDRESS_EDITED', 'CUSTOMER_NOTE_EDITED', 'CUSTOMER_PROVINCE_EDITED', 'CUSTOMER_CITY_EDITED', 'CUSTOMER_DISTRICT_EDITED', 'CUSTOMER_LANDMARK_EDITED');

-- -- CreateEnum
-- CREATE TYPE "ActivityActorType" AS ENUM ('USER', 'CUSTOMER', 'SYSTEM');

-- -- CreateEnum
-- CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');

-- -- CreateEnum
-- CREATE TYPE "PaymentEntryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- -- AlterEnum
-- BEGIN;
-- CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'RETURNED');
-- ALTER TABLE "public"."orders" ALTER COLUMN "status" DROP DEFAULT;
-- ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
-- ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
-- ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
-- DROP TYPE "public"."OrderStatus_old";
-- ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';
-- COMMIT;

-- -- AlterEnum
-- -- This migration adds more than one value to an enum.
-- -- With PostgreSQL versions 11 and earlier, this is not possible
-- -- in a single migration. This can be worked around by creating
-- -- multiple migrations, each migration adding only one value to
-- -- the enum.


-- ALTER TYPE "PaymentMethod" ADD VALUE 'CASH';
-- ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';
-- ALTER TYPE "PaymentMethod" ADD VALUE 'CARD';
-- ALTER TYPE "PaymentMethod" ADD VALUE 'FONEPAY';

-- -- AlterEnum
-- BEGIN;
-- CREATE TYPE "PaymentStatus_new" AS ENUM ('UNPAID', 'PARTIAL_PAID', 'PAID', 'REFUNDED');
-- ALTER TABLE "public"."orders" ALTER COLUMN "payment_status" DROP DEFAULT;
-- ALTER TABLE "public"."payments" ALTER COLUMN "status" DROP DEFAULT;
-- ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "PaymentStatus_new" USING ("payment_status"::text::"PaymentStatus_new");
-- ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
-- ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
-- DROP TYPE "public"."PaymentStatus_old";
-- ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'UNPAID';
-- COMMIT;

-- -- DropForeignKey
-- ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_fkey";

-- -- DropForeignKey
-- ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_changed_by_id_fkey";

-- -- DropForeignKey
-- ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_order_id_fkey";

-- -- DropForeignKey
-- ALTER TABLE "reviews" DROP CONSTRAINT "reviews_product_id_fkey";

-- -- DropIndex
-- DROP INDEX "orders_review_token_key";

-- -- AlterTable
-- ALTER TABLE "customers" ADD COLUMN     "total_order" INTEGER NOT NULL DEFAULT 0;

-- -- AlterTable
-- ALTER TABLE "order_items" DROP COLUMN "size",
-- ADD COLUMN     "coupon_discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
-- ADD COLUMN     "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
-- ADD COLUMN     "discount_type" "DiscountType",
-- ADD COLUMN     "discount_value" DECIMAL(12,2),
-- ADD COLUMN     "outlet_id" TEXT NOT NULL,
-- ADD COLUMN     "sku" TEXT,
-- ADD COLUMN     "variant_name" TEXT,
-- ALTER COLUMN "product_id" SET NOT NULL;

-- -- AlterTable
-- ALTER TABLE "orders" DROP COLUMN "accepted_at",
-- DROP COLUMN "courier_name",
-- DROP COLUMN "decline_reason",
-- DROP COLUMN "delivered_at",
-- DROP COLUMN "dispatched_at",
-- DROP COLUMN "ready_at",
-- DROP COLUMN "review_token",
-- DROP COLUMN "shipping_fee",
-- DROP COLUMN "tracking_number",
-- ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'WEBSITE',
-- ADD COLUMN     "coupon_code" TEXT,
-- ADD COLUMN     "coupon_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
-- ADD COLUMN     "coupon_id" TEXT,
-- ADD COLUMN     "created_by_id" TEXT,
-- ADD COLUMN     "customer_id" TEXT,
-- ADD COLUMN     "delivery_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
-- ADD COLUMN     "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
-- ADD COLUMN     "order_discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
-- ADD COLUMN     "order_discount_type" "DiscountType",
-- ADD COLUMN     "order_discount_value" DECIMAL(12,2),
-- ADD COLUMN     "order_note" TEXT,
-- ADD COLUMN     "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
-- ADD COLUMN     "refunded_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
-- ALTER COLUMN "payment_status" SET DEFAULT 'UNPAID';

-- -- AlterTable
-- ALTER TABLE "payments" DROP COLUMN "paid_at",
-- DROP COLUMN "transaction_id",
-- ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
-- ADD COLUMN     "note" TEXT,
-- ADD COLUMN     "received_by_id" TEXT,
-- ADD COLUMN     "reference" TEXT,
-- ADD COLUMN     "tendered" DECIMAL(12,2),
-- DROP COLUMN "status",
-- ADD COLUMN     "status" "PaymentEntryStatus" NOT NULL DEFAULT 'SUCCESS';

-- -- AlterTable
-- ALTER TABLE "reviews" ADD COLUMN     "variant_id" TEXT,
-- ALTER COLUMN "product_id" SET NOT NULL;

-- -- AlterTable
-- ALTER TABLE "stores" ADD COLUMN     "next_order_number" INTEGER NOT NULL DEFAULT 1001;

-- -- DropTable
-- DROP TABLE "order_status_history";

-- -- CreateTable
-- CREATE TABLE "coupons" (
--     "id" TEXT NOT NULL,
--     "store_id" TEXT NOT NULL,
--     "code" TEXT NOT NULL,
--     "description" TEXT,
--     "discount_type" "DiscountType" NOT NULL,
--     "discount_value" DECIMAL(12,2) NOT NULL,
--     "scope" "CouponScope" NOT NULL DEFAULT 'ORDER',
--     "max_discount_amount" DECIMAL(12,2),
--     "min_order_amount" DECIMAL(12,2),
--     "starts_at" TIMESTAMP(3),
--     "ends_at" TIMESTAMP(3),
--     "usage_limit" INTEGER,
--     "per_customer_limit" INTEGER,
--     "used_count" INTEGER NOT NULL DEFAULT 0,
--     "is_active" BOOLEAN NOT NULL DEFAULT true,
--     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     "updated_at" TIMESTAMP(3) NOT NULL,

--     CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
-- );

-- -- CreateTable
-- CREATE TABLE "coupon_products" (
--     "id" TEXT NOT NULL,
--     "coupon_id" TEXT NOT NULL,
--     "product_id" TEXT NOT NULL,
--     "variant_id" TEXT,

--     CONSTRAINT "coupon_products_pkey" PRIMARY KEY ("id")
-- );

-- -- CreateTable
-- CREATE TABLE "order_activities" (
--     "id" TEXT NOT NULL,
--     "order_id" TEXT NOT NULL,
--     "action" "OrderActivityAction" NOT NULL,
--     "title" TEXT NOT NULL,
--     "actor_type" "ActivityActorType" NOT NULL,
--     "actor_id" TEXT,
--     "actor_name" TEXT,
--     "actor_role" TEXT,
--     "meta" JSONB,
--     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

--     CONSTRAINT "order_activities_pkey" PRIMARY KEY ("id")
-- );

-- -- CreateIndex
-- CREATE INDEX "coupons_store_id_is_active_idx" ON "coupons"("store_id", "is_active");

-- -- CreateIndex
-- CREATE UNIQUE INDEX "coupons_store_id_code_key" ON "coupons"("store_id", "code");

-- -- CreateIndex
-- CREATE INDEX "coupon_products_coupon_id_idx" ON "coupon_products"("coupon_id");

-- -- CreateIndex
-- CREATE INDEX "coupon_products_product_id_idx" ON "coupon_products"("product_id");

-- -- CreateIndex
-- CREATE INDEX "order_activities_order_id_created_at_idx" ON "order_activities"("order_id", "created_at");

-- -- CreateIndex
-- CREATE INDEX "customers_store_id_name_idx" ON "customers"("store_id", "name");

-- -- CreateIndex
-- CREATE INDEX "order_items_outlet_id_idx" ON "order_items"("outlet_id");

-- -- CreateIndex
-- CREATE INDEX "orders_store_id_channel_created_at_idx" ON "orders"("store_id", "channel", "created_at");

-- -- CreateIndex
-- CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- -- CreateIndex
-- CREATE INDEX "orders_coupon_id_customer_phone_idx" ON "orders"("coupon_id", "customer_phone");

-- -- CreateIndex
-- CREATE INDEX "reviews_variant_id_is_visible_created_at_idx" ON "reviews"("variant_id", "is_visible", "created_at");

-- -- AddForeignKey
-- ALTER TABLE "coupons" ADD CONSTRAINT "coupons_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "order_items" ADD CONSTRAINT "order_items_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE "reviews" ADD CONSTRAINT "reviews_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =======================================================================================================================================================



/*
  FIXED VERSION of 20261015111741_add_order_schema_and_enums/migration.sql

  What was changed compared with the file Prisma generated (search for "FIX"):
    FIX 1  drop the old order_status_history table FIRST (it still uses the old OrderStatus type)
    FIX 2  OrderStatus: old values are CONVERTED (ACCEPTED/READY -> PROCESSING, DECLINED -> CANCELLED)
    FIX 3  payments.status moves to the new PaymentEntryStatus type BEFORE PaymentStatus is replaced;
           PaymentStatus: old values are converted (PENDING/FAILED -> UNPAID)
    FIX 4  the DropForeignKey / DropTable lines for order_status_history are removed (FIX 1 does it)
    FIX 5  order_items.outlet_id is added as optional, filled from the order, THEN made required
    FIX 6  shipping_fee is RENAMED to delivery_fee (the generated file dropped it and lost the numbers)
    FIX 7  orders that were already paid / refunded get paid_amount / refunded_amount filled in

  Warnings from Prisma (still true):
  - The values [ACCEPTED,DECLINED,READY] on the enum `OrderStatus` will be removed.   (converted, see FIX 2)
  - The values [PENDING,FAILED] on the enum `PaymentStatus` will be removed.          (converted, see FIX 3)
  - Dropped columns lose their data: order_items.size, orders.accepted_at / courier_name / decline_reason /
    delivered_at / dispatched_at / ready_at / review_token / tracking_number, payments.paid_at / transaction_id
  - The old payments.status values are NOT kept (every existing payment becomes SUCCESS)
  - order_items.product_id and reviews.product_id become required: this FAILS if any row has NULL there
    (see the check right above those lines)
*/

-- FIX 1: the old status-history table uses the old OrderStatus type, so it must go BEFORE the type is replaced.
-- Its foreign keys disappear together with the table.
DROP TABLE "order_status_history";

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "CouponScope" AS ENUM ('ORDER', 'PRODUCT');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('WEBSITE', 'POS', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrderActivityAction" AS ENUM ('ORDER_CREATED', 'ORDER_EDITED', 'ORDER_STATUS_CHANGED', 'ORDER_NOTE_EDITED', 'ITEMS_EDITED', 'PAYMENT_METHOD_CHANGED', 'PAYMENT_STATUS_CHANGED', 'LABELS_CHANGED', 'DISCOUNT_CHANGED', 'CUSTOMER_NAME_EDITED', 'CUSTOMER_PHONE_EDITED', 'CUSTOMER_EMAIL_EDITED', 'CUSTOMER_ADDRESS_EDITED', 'CUSTOMER_NOTE_EDITED', 'CUSTOMER_PROVINCE_EDITED', 'CUSTOMER_CITY_EDITED', 'CUSTOMER_DISTRICT_EDITED', 'CUSTOMER_LANDMARK_EDITED');

-- CreateEnum
CREATE TYPE "ActivityActorType" AS ENUM ('USER', 'CUSTOMER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentEntryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterEnum
-- FIX 2: old values are converted instead of making the migration fail
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'RETURNED');
ALTER TABLE "public"."orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  (CASE "status"::text
     WHEN 'ACCEPTED' THEN 'PROCESSING'
     WHEN 'READY'    THEN 'PROCESSING'
     WHEN 'DECLINED' THEN 'CANCELLED'
     ELSE "status"::text
   END)::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'CASH';
ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';
ALTER TYPE "PaymentMethod" ADD VALUE 'CARD';
ALTER TYPE "PaymentMethod" ADD VALUE 'FONEPAY';

-- FIX 3a: payments.status gets its NEW type first. Before, it still used the old PaymentStatus type
-- when that type was dropped below, which made the migration fail.
ALTER TABLE "payments" DROP COLUMN "status",
ADD COLUMN     "status" "PaymentEntryStatus" NOT NULL DEFAULT 'SUCCESS';

-- AlterEnum
-- FIX 3b: old values are converted; the "payments" DROP DEFAULT line was removed (it would remove the new default)
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('UNPAID', 'PARTIAL_PAID', 'PAID', 'REFUNDED');
ALTER TABLE "public"."orders" ALTER COLUMN "payment_status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "PaymentStatus_new" USING (
  (CASE "payment_status"::text
     WHEN 'PENDING' THEN 'UNPAID'
     WHEN 'FAILED'  THEN 'UNPAID'
     ELSE "payment_status"::text
   END)::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'UNPAID';
COMMIT;

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_fkey";

-- FIX 4: the two DropForeignKey statements for "order_status_history" were removed (FIX 1 dropped the table)

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_product_id_fkey";

-- DropIndex
DROP INDEX "orders_review_token_key";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "total_order" INTEGER NOT NULL DEFAULT 0;

-- CHECK BEFORE RUNNING (the next table makes product_id required). Both must return 0:
--   SELECT count(*) FROM order_items WHERE product_id IS NULL;
--   SELECT count(*) FROM reviews     WHERE product_id IS NULL;
-- If they do not, delete those rows first (they point to a product that no longer exists), e.g.
--   DELETE FROM order_items WHERE product_id IS NULL;

-- AlterTable
-- FIX 5: "outlet_id" is added WITHOUT "NOT NULL" here; it is filled and made required at the end of this file
ALTER TABLE "order_items" DROP COLUMN "size",
ADD COLUMN     "coupon_discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_type" "DiscountType",
ADD COLUMN     "discount_value" DECIMAL(12,2),
ADD COLUMN     "outlet_id" TEXT,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "variant_name" TEXT,
ALTER COLUMN "product_id" SET NOT NULL;

-- FIX 6: keep the numbers: rename instead of drop + add
ALTER TABLE "orders" RENAME COLUMN "shipping_fee" TO "delivery_fee";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "accepted_at",
DROP COLUMN "courier_name",
DROP COLUMN "decline_reason",
DROP COLUMN "delivered_at",
DROP COLUMN "dispatched_at",
DROP COLUMN "ready_at",
DROP COLUMN "review_token",
DROP COLUMN "tracking_number",
ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'WEBSITE',
ADD COLUMN     "coupon_code" TEXT,
ADD COLUMN     "coupon_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "coupon_id" TEXT,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "customer_id" TEXT,
ADD COLUMN     "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "order_discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "order_discount_type" "DiscountType",
ADD COLUMN     "order_discount_value" DECIMAL(12,2),
ADD COLUMN     "order_note" TEXT,
ADD COLUMN     "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "refunded_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ALTER COLUMN "payment_status" SET DEFAULT 'UNPAID';

-- AlterTable
-- (FIX 3a already replaced "status" on this table)
ALTER TABLE "payments" DROP COLUMN "paid_at",
DROP COLUMN "transaction_id",
ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "received_by_id" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "tendered" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "variant_id" TEXT,
ALTER COLUMN "product_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "next_order_number" INTEGER NOT NULL DEFAULT 1001;

-- (FIX 4: "DROP TABLE order_status_history" was here; it is now at the top of the file)

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL,
    "discount_value" DECIMAL(12,2) NOT NULL,
    "scope" "CouponScope" NOT NULL DEFAULT 'ORDER',
    "max_discount_amount" DECIMAL(12,2),
    "min_order_amount" DECIMAL(12,2),
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "usage_limit" INTEGER,
    "per_customer_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_products" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,

    CONSTRAINT "coupon_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_activities" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "action" "OrderActivityAction" NOT NULL,
    "title" TEXT NOT NULL,
    "actor_type" "ActivityActorType" NOT NULL,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "actor_role" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupons_store_id_is_active_idx" ON "coupons"("store_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_store_id_code_key" ON "coupons"("store_id", "code");

-- CreateIndex
CREATE INDEX "coupon_products_coupon_id_idx" ON "coupon_products"("coupon_id");

-- CreateIndex
CREATE INDEX "coupon_products_product_id_idx" ON "coupon_products"("product_id");

-- CreateIndex
CREATE INDEX "order_activities_order_id_created_at_idx" ON "order_activities"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "customers_store_id_name_idx" ON "customers"("store_id", "name");

-- CreateIndex
CREATE INDEX "order_items_outlet_id_idx" ON "order_items"("outlet_id");

-- CreateIndex
CREATE INDEX "orders_store_id_channel_created_at_idx" ON "orders"("store_id", "channel", "created_at");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_coupon_id_customer_phone_idx" ON "orders"("coupon_id", "customer_phone");

-- CreateIndex
CREATE INDEX "reviews_variant_id_is_visible_created_at_idx" ON "reviews"("variant_id", "is_visible", "created_at");

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- FIX 5 (finish): every existing order line takes the outlet of its order, then the column becomes required
-- ============================================================================
UPDATE "order_items" i
SET "outlet_id" = o."outlet_id"
FROM "orders" o
WHERE o."id" = i."order_id" AND i."outlet_id" IS NULL;

ALTER TABLE "order_items" ALTER COLUMN "outlet_id" SET NOT NULL;

-- ============================================================================
-- FIX 7: orders that were already paid / refunded under the OLD design get matching amounts,
-- so the payment-status rules added later do not flip them back to UNPAID
-- ============================================================================
UPDATE "orders" SET "paid_amount" = "total" WHERE "payment_status" IN ('PAID', 'REFUNDED');
UPDATE "orders" SET "refunded_amount" = "total" WHERE "payment_status" = 'REFUNDED';