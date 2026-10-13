/*
  Warnings:

  - Added the required column `outlet_id` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'EXPIRING_SOON', 'DEAD_STOCK');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('STOCK_IN', 'SALE', 'SALE_RESTORE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "outlet_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "supplier_name" TEXT,
    "note" TEXT,
    "total_quantity" INTEGER NOT NULL,
    "total_cost" DECIMAL(14,2) NOT NULL,
    "performed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "receipt_id" TEXT,
    "source_batch_id" TEXT,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "outlet_id" TEXT NOT NULL,
    "batch_number" TEXT,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total_cost" DECIMAL(14,2) NOT NULL,
    "remaining_quantity" INTEGER NOT NULL,
    "manufacture_date" DATE,
    "expiry_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "batch_id" TEXT,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "reference_number" TEXT,
    "note" TEXT,
    "receipt_id" TEXT,
    "order_id" TEXT,
    "transfer_id" TEXT,
    "performed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "from_outlet_id" TEXT NOT NULL,
    "to_outlet_id" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "batch_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_receipts_store_id_created_at_idx" ON "stock_receipts"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_receipts_store_id_reference_number_idx" ON "stock_receipts"("store_id", "reference_number");

-- CreateIndex
CREATE INDEX "stock_receipts_outlet_id_created_at_idx" ON "stock_receipts"("outlet_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_batches_outlet_id_product_id_variant_id_expiry_date_idx" ON "stock_batches"("outlet_id", "product_id", "variant_id", "expiry_date");

-- CreateIndex
CREATE INDEX "stock_batches_store_id_expiry_date_idx" ON "stock_batches"("store_id", "expiry_date");

-- CreateIndex
CREATE INDEX "stock_batches_receipt_id_idx" ON "stock_batches"("receipt_id");

-- CreateIndex
CREATE INDEX "stock_movements_store_id_created_at_idx" ON "stock_movements"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_outlet_id_product_id_variant_id_created_at_idx" ON "stock_movements"("outlet_id", "product_id", "variant_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_batch_id_idx" ON "stock_movements"("batch_id");

-- CreateIndex
CREATE INDEX "stock_movements_order_id_idx" ON "stock_movements"("order_id");

-- CreateIndex
CREATE INDEX "stock_movements_transfer_id_idx" ON "stock_movements"("transfer_id");

-- CreateIndex
CREATE INDEX "stock_transfers_store_id_status_created_at_idx" ON "stock_transfers"("store_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "stock_transfers_to_outlet_id_status_idx" ON "stock_transfers"("to_outlet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_store_id_reference_number_key" ON "stock_transfers"("store_id", "reference_number");

-- CreateIndex
CREATE INDEX "stock_transfer_items_transfer_id_idx" ON "stock_transfer_items"("transfer_id");

-- CreateIndex
CREATE INDEX "stock_transfer_items_batch_id_idx" ON "stock_transfer_items"("batch_id");

-- CreateIndex
CREATE INDEX "outlets_store_id_is_active_idx" ON "outlets"("store_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_store_id_name_key" ON "outlets"("store_id", "name");

-- CreateIndex
CREATE INDEX "orders_outlet_id_idx" ON "orders"("outlet_id");

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_source_batch_id_fkey" FOREIGN KEY ("source_batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_product_id_store_id_fkey" FOREIGN KEY ("product_id", "store_id") REFERENCES "products"("id", "store_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_store_id_fkey" FOREIGN KEY ("product_id", "store_id") REFERENCES "products"("id", "store_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_outlet_id_fkey" FOREIGN KEY ("from_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_outlet_id_fkey" FOREIGN KEY ("to_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_product_id_store_id_fkey" FOREIGN KEY ("product_id", "store_id") REFERENCES "products"("id", "store_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;




-- ============================================================================
-- INVENTORY: custom SQL that Prisma can't express
--
-- How to use:
--   1. Add the inventory models to schema.prisma
--   2. npx prisma migrate dev --create-only --name inventory
--   3. Open prisma/migrations/<date>_inventory/migration.sql
--      and paste this whole file at the END (the view needs the tables and the
--      "StockStatus" type that Prisma creates earlier in that same file)
--   4. npx prisma migrate dev          (production: npx prisma migrate deploy)
--
-- The numbers are the same for every store, so they are written in the view:
--     LOW STOCK     = fewer than 10 sellable units     (search "< 10")
--     EXPIRING SOON = expires within the next 7 days   (search "+ 7")
--     "today"       = today's date in Nepal time       (search 'Asia/Kathmandu')
--
-- To change the view later: make a NEW migration that starts with
--     DROP VIEW IF EXISTS v_stock_levels;
-- and then the new CREATE VIEW. Postgres refuses to change a column that a view uses
-- unless the view is dropped first.
-- ============================================================================

-- ---- Outlets: exactly one MAIN outlet per store ----------------------------
CREATE UNIQUE INDEX uq_one_main_outlet_per_store ON outlets (store_id) WHERE is_main;

-- ---- Batches: the data can never go wrong -------------------------------------
ALTER TABLE stock_batches ADD CONSTRAINT ck_batch_qty
  CHECK (quantity > 0 AND remaining_quantity >= 0 AND remaining_quantity <= quantity);

ALTER TABLE stock_batches ADD CONSTRAINT ck_batch_dates
  CHECK (manufacture_date IS NULL OR expiry_date IS NULL OR manufacture_date <= expiry_date);

-- Two small indexes that only contain batches that still have units.
-- Sold-out batches (most of the history) are left out, so they stay fast as data grows.
--   1) picking batches for an order, earliest expiry first
CREATE INDEX ix_batches_available
  ON stock_batches (outlet_id, product_id, variant_id, expiry_date)
  WHERE remaining_quantity > 0;
--   2) the stock screen (the view below) reading one store's live batches
CREATE INDEX ix_batches_live_by_store
  ON stock_batches (store_id, outlet_id)
  WHERE remaining_quantity > 0;

-- ---- Transfers: source and destination must differ ---------------------------
ALTER TABLE stock_transfers ADD CONSTRAINT ck_transfer_outlets
  CHECK (from_outlet_id <> to_outlet_id);

-- ============================================================================
-- v_stock_levels
--
-- A saved question the database answers each time you read it:
--   "for every product (or variant) in every outlet, how many units can be sold,
--    how many are expired, how many expire within 7 days, and what is the status?"
-- Nothing is stored, so it can never be out of date, even right after midnight.
--
-- Status, the first rule that matches wins:
--   DEAD_STOCK     nothing sellable, only expired units left
--   OUT_OF_STOCK   nothing left at all
--   EXPIRING_SOON  some sellable units expire within 7 days
--   LOW_STOCK      fewer than 10 sellable units
--   IN_STOCK       everything else
-- A batch is sellable through its expiry date and expired from the next day.
--
-- ALWAYS filter it:  WHERE store_id = $1 [AND outlet_id = $2]  and paginate.
-- ============================================================================
DROP VIEW IF EXISTS v_stock_levels;

CREATE VIEW v_stock_levels AS
WITH today AS (
  SELECT (now() AT TIME ZONE 'Asia/Kathmandu')::date AS d
),

-- Step 1: add up ONLY the batches that still have units, one row per (outlet, item).
-- COALESCE(variant_id, product_id) is one "item key" for both kinds of stock
-- (ids are unique uuids, so a product id never equals a variant id). A single plain key
-- lets the database join quickly.
live AS (
  SELECT
    b.store_id,
    b.outlet_id,
    COALESCE(b.variant_id, b.product_id) AS item_key,
    COALESCE(SUM(b.remaining_quantity)
      FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= t.d), 0)::int            AS sellable_quantity,
    COALESCE(SUM(b.remaining_quantity)
      FILTER (WHERE b.expiry_date < t.d), 0)::int                                      AS expired_quantity,
    COALESCE(SUM(b.remaining_quantity)
      FILTER (WHERE b.expiry_date >= t.d AND b.expiry_date <= t.d + 7), 0)::int        AS expiring_soon_quantity,
    MIN(b.expiry_date) FILTER (WHERE b.expiry_date >= t.d)                             AS nearest_expiry_date
  FROM stock_batches b
  CROSS JOIN today t
  WHERE b.remaining_quantity > 0
  GROUP BY b.store_id, b.outlet_id, COALESCE(b.variant_id, b.product_id)
),

-- Step 2: everything that can be sold: products without variants, and every variant
items AS (
  SELECT p.store_id, p.id AS product_id, NULL::text AS variant_id, p.id AS item_key
    FROM products p
   WHERE NOT p.has_variants AND p.status <> 'ARCHIVED'
  UNION ALL
  SELECT p.store_id, v.product_id, v.id, v.id
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
   WHERE p.has_variants AND p.status <> 'ARCHIVED'
),

-- Step 3: every item in every active outlet, with its totals (0 when it has no live batches)
combined AS (
  SELECT
    i.store_id,
    o.id AS outlet_id,
    i.product_id,
    i.variant_id,
    COALESCE(l.sellable_quantity, 0)      AS sellable_quantity,
    COALESCE(l.expired_quantity, 0)       AS expired_quantity,
    COALESCE(l.expiring_soon_quantity, 0) AS expiring_soon_quantity,
    l.nearest_expiry_date
  FROM items i
  JOIN outlets o ON o.store_id = i.store_id AND o.is_active
  LEFT JOIN live l
    ON  l.store_id  = i.store_id
    AND l.outlet_id = o.id
    AND l.item_key  = i.item_key
)

-- Step 4: the status
SELECT
  c.*,
  (CASE
     WHEN c.sellable_quantity = 0 AND c.expired_quantity > 0 THEN 'DEAD_STOCK'
     WHEN c.sellable_quantity = 0                            THEN 'OUT_OF_STOCK'
     WHEN c.expiring_soon_quantity > 0                       THEN 'EXPIRING_SOON'
     WHEN c.sellable_quantity < 10                           THEN 'LOW_STOCK'
     ELSE 'IN_STOCK'
   END)::"StockStatus" AS status
FROM combined c;