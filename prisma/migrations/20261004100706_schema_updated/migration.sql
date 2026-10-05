/*
  Warnings:

  - You are about to drop the column `lineTotal` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `orderId` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `productName` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `variantId` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `changedBy` on the `order_status_history` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `order_status_history` table. All the data in the column will be lost.
  - You are about to drop the column `orderId` on the `order_status_history` table. All the data in the column will be lost.
  - You are about to drop the column `acceptedAt` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `checkoutId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `courierName` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `customerNote` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `declineReason` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `deliveredAt` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `dispatchedAt` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `orderNumber` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethod` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `paymentStatus` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `readyAt` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `recipientName` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `recipientPhone` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `shippingFee` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `shopId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `trackingNumber` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `checkoutId` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `gatewayRef` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `gatewayResponse` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `paidAt` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `transactionId` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `discountPrice` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `shop_id` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `address` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `district` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `gender` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `province` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `cart_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `carts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `checkouts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `shops` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[review_token]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[store_id,order_number]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[gateway_ref]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[store_id,slug]` on the table `products` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `line_total` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `order_id` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product_name` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit_price` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `order_id` to the `order_status_history` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customer_name` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customer_phone` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `order_number` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `payment_method` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `store_id` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `order_id` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category_id` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `store_id` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `max_stores` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StoreRole" AS ENUM ('OWNER', 'MANAGER', 'ORDER_MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BusinessCategory" AS ENUM ('GENERAL', 'FASHION', 'BEAUTY', 'ELECTRONICS', 'GROCERY', 'PHARMACY', 'PET_SUPPLIES', 'SPORTS', 'RESTAURANTS', 'HOME_DECOR', 'OTHER');

-- DropForeignKey
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_cartId_fkey";

-- DropForeignKey
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_variantId_fkey";

-- DropForeignKey
ALTER TABLE "carts" DROP CONSTRAINT "carts_userId_fkey";

-- DropForeignKey
ALTER TABLE "checkouts" DROP CONSTRAINT "checkouts_customerId_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_orderId_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_variantId_fkey";

-- DropForeignKey
ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_orderId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_checkoutId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customerId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_shopId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_checkoutId_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "shops" DROP CONSTRAINT "shops_owner_id_fkey";

-- DropIndex
DROP INDEX "order_items_orderId_idx";

-- DropIndex
DROP INDEX "order_status_history_orderId_idx";

-- DropIndex
DROP INDEX "orders_checkoutId_idx";

-- DropIndex
DROP INDEX "orders_customerId_createdAt_idx";

-- DropIndex
DROP INDEX "orders_orderNumber_key";

-- DropIndex
DROP INDEX "orders_shopId_status_idx";

-- DropIndex
DROP INDEX "payments_checkoutId_idx";

-- DropIndex
DROP INDEX "payments_gatewayRef_key";

-- DropIndex
DROP INDEX "products_category_status_idx";

-- DropIndex
DROP INDEX "products_shop_id_created_at_idx";

-- DropIndex
DROP INDEX "products_shop_id_status_idx";

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "lineTotal",
DROP COLUMN "orderId",
DROP COLUMN "productId",
DROP COLUMN "productName",
DROP COLUMN "unitPrice",
DROP COLUMN "variantId",
ADD COLUMN     "line_total" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "order_id" TEXT NOT NULL,
ADD COLUMN     "product_id" TEXT,
ADD COLUMN     "product_name" TEXT NOT NULL,
ADD COLUMN     "unit_price" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "variant_id" TEXT;

-- AlterTable
ALTER TABLE "order_status_history" DROP COLUMN "changedBy",
DROP COLUMN "createdAt",
DROP COLUMN "orderId",
ADD COLUMN     "changed_by_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "order_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "acceptedAt",
DROP COLUMN "checkoutId",
DROP COLUMN "courierName",
DROP COLUMN "createdAt",
DROP COLUMN "customerId",
DROP COLUMN "customerNote",
DROP COLUMN "declineReason",
DROP COLUMN "deliveredAt",
DROP COLUMN "dispatchedAt",
DROP COLUMN "orderNumber",
DROP COLUMN "paymentMethod",
DROP COLUMN "paymentStatus",
DROP COLUMN "readyAt",
DROP COLUMN "recipientName",
DROP COLUMN "recipientPhone",
DROP COLUMN "shippingFee",
DROP COLUMN "shopId",
DROP COLUMN "trackingNumber",
DROP COLUMN "updatedAt",
ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "courier_name" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "customer_email" TEXT,
ADD COLUMN     "customer_name" TEXT NOT NULL,
ADD COLUMN     "customer_note" TEXT,
ADD COLUMN     "customer_phone" TEXT NOT NULL,
ADD COLUMN     "decline_reason" TEXT,
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "dispatched_at" TIMESTAMP(3),
ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "order_number" INTEGER NOT NULL,
ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL,
ADD COLUMN     "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "ready_at" TIMESTAMP(3),
ADD COLUMN     "review_token" TEXT,
ADD COLUMN     "shipping_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "store_id" TEXT NOT NULL,
ADD COLUMN     "tracking_number" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "checkoutId",
DROP COLUMN "createdAt",
DROP COLUMN "gatewayRef",
DROP COLUMN "gatewayResponse",
DROP COLUMN "paidAt",
DROP COLUMN "transactionId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "gateway_ref" TEXT,
ADD COLUMN     "gateway_response" JSONB,
ADD COLUMN     "order_id" TEXT NOT NULL,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "transaction_id" TEXT;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "category",
DROP COLUMN "discountPrice",
DROP COLUMN "shop_id",
ADD COLUMN     "brand_id" TEXT,
ADD COLUMN     "category_id" TEXT NOT NULL,
ADD COLUMN     "discount_price" DECIMAL(12,2),
ADD COLUMN     "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "store_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "address",
DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "district",
DROP COLUMN "gender",
DROP COLUMN "province",
DROP COLUMN "role",
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_stores" INTEGER NOT NULL,
ALTER COLUMN "phone" DROP NOT NULL;

-- DropTable
DROP TABLE "cart_items";

-- DropTable
DROP TABLE "carts";

-- DropTable
DROP TABLE "checkouts";

-- DropTable
DROP TABLE "shops";

-- DropEnum
DROP TYPE "Gender";

-- DropEnum
DROP TYPE "ProductCategory";

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "image" TEXT,
    "description" TEXT,
    "seo_title" TEXT,
    "seo_image" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "logo" TEXT,
    "description" TEXT,
    "seo_title" TEXT,
    "seo_image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "product_id" TEXT,
    "reviewer_name" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "category" "BusinessCategory" NOT NULL DEFAULT 'GENERAL',
    "logo" TEXT,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "store_address" TEXT NOT NULL,
    "business_name" TEXT,
    "business_email" TEXT,
    "business_phone" TEXT,
    "business_address" TEXT,
    "pan_number" TEXT,
    "registration_number" TEXT,
    "ecommerce_license" TEXT,
    "return_policy" TEXT,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "seo_image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_members" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "StoreRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_invites" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "StoreRole" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_store_id_is_available_idx" ON "categories"("store_id", "is_available");

-- CreateIndex
CREATE UNIQUE INDEX "categories_store_id_slug_key" ON "categories"("store_id", "slug");

-- CreateIndex
CREATE INDEX "brands_store_id_is_available_idx" ON "brands"("store_id", "is_available");

-- CreateIndex
CREATE UNIQUE INDEX "brands_store_id_slug_key" ON "brands"("store_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_item_id_key" ON "reviews"("order_item_id");

-- CreateIndex
CREATE INDEX "reviews_store_id_created_at_idx" ON "reviews"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_product_id_is_visible_created_at_idx" ON "reviews"("product_id", "is_visible", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE INDEX "stores_status_idx" ON "stores"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stores_name_slug_key" ON "stores"("name", "slug");

-- CreateIndex
CREATE INDEX "store_members_user_id_idx" ON "store_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_members_store_id_user_id_key" ON "store_members"("store_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_invites_token_hash_key" ON "store_invites"("token_hash");

-- CreateIndex
CREATE INDEX "store_invites_store_id_idx" ON "store_invites"("store_id");

-- CreateIndex
CREATE INDEX "store_invites_email_idx" ON "store_invites"("email");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_review_token_key" ON "orders"("review_token");

-- CreateIndex
CREATE INDEX "orders_store_id_status_created_at_idx" ON "orders"("store_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_store_id_customer_phone_idx" ON "orders"("store_id", "customer_phone");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_id_order_number_key" ON "orders"("store_id", "order_number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_ref_key" ON "payments"("gateway_ref");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "products_store_id_status_created_at_idx" ON "products"("store_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "products_store_id_category_id_status_idx" ON "products"("store_id", "category_id", "status");

-- CreateIndex
CREATE INDEX "products_store_id_brand_id_status_idx" ON "products"("store_id", "brand_id", "status");

-- CreateIndex
CREATE INDEX "products_store_id_audience_status_idx" ON "products"("store_id", "audience", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_slug_key" ON "products"("store_id", "slug");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_invites" ADD CONSTRAINT "store_invites_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_invites" ADD CONSTRAINT "store_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
