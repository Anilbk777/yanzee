import { randomUUID } from "crypto";
import prisma from "../../config/dbConfig.js";
import Prisma from "../../../generated/prisma/index.js"; // adjust to where your client is generated


// ---------- validation reads (three independent queries, run together) ----------
export const getStockInRefsModel = async (storeId, outletId, productIds, variantIds) => {
  const [outlet, products, variants] = await Promise.all([
    prisma.outlet.findFirst({
      where: { id: outletId, storeId },
      select: { id: true, isActive: true },
    }),
    prisma.product.findMany({
      where: { storeId, id: { in: productIds } },
      select: { id: true, name: true, hasVariants: true, status: true },
    }),
    variantIds.length
      ? prisma.productVariant.findMany({
        where: { storeId, id: { in: variantIds } },
        select: { id: true, productId: true },
      })
      : [],
  ]);

  return { outlet, products, variants };
};

// ---------- stock in ----------
// One statement = one round trip, and it is atomic (everything saves or nothing does).
// Foreign keys are checked at the end of the statement, so the movement, batches and
// lines can all be inserted together.
export const createStockInModel = async (
  storeId,
  userId,
  { outletId, referenceNumber, supplierName, note, totalQuantity, totalCost, totalProducts, lines }
) => {
  const n = lines.length;
  const movementId = randomUUID();
  const batchIds = lines.map(() => randomUUID());

  // Arrays can't hold NULL safely through every driver, so empty text stands for NULL
  const blank = (v) => v ?? "";

  const [row] = await prisma.$queryRaw`
        WITH
        -- 1. reserve n batch numbers (locks the store row until this statement commits)
        reserve AS (
            UPDATE stores
            SET next_batch_number = next_batch_number + ${n}::int
            WHERE id = ${storeId}
            RETURNING next_batch_number - ${n}::int AS first
        ),
        -- 2. the movement (header)
        mov AS (
            INSERT INTO stock_movements
                (id, store_id, type, outlet_id, reference_number, supplier_name, note,
                 performed_by_id, total_quantity, total_cost, total_products)
            SELECT ${movementId}, ${storeId}, 'STOCK_IN'::"MovementType", ${outletId},
                   ${referenceNumber}, ${supplierName}, ${note},
                   ${userId}, ${totalQuantity}::int, ${totalCost}::numeric, ${totalProducts}::int
            FROM reserve
            RETURNING id, created_at
        ),
        -- the request lines as a table. ord starts at 1.
        src AS (
            SELECT *
            FROM unnest(
                ${batchIds}::text[],
                ${lines.map((l) => l.productId)}::text[],
                ${lines.map((l) => blank(l.variantId))}::text[],
                ${lines.map((l) => blank(l.supplierLot))}::text[],
                ${lines.map((l) => l.quantity)}::int[],
                ${lines.map((l) => l.unitCost)}::text[],
                ${lines.map((l) => blank(l.manufactureDate))}::text[],
                ${lines.map((l) => blank(l.expiryDate))}::text[]
            ) WITH ORDINALITY AS t(id, product_id, variant_id, supplier_lot, qty, unit_cost, mfg, exp, ord)
        ),
        -- 3. one batch per line
        ins_batches AS (
            INSERT INTO stock_batches
                (id, store_id, batch_number, supplier_lot, movement_id, product_id, variant_id, outlet_id,
                 unit_cost, quantity, remaining_quantity, manufacture_date, expiry_date, updated_at)
            SELECT s.id, ${storeId}, r.first + s.ord::int - 1, NULLIF(s.supplier_lot, ''), m.id,
                   s.product_id, NULLIF(s.variant_id, ''), ${outletId},
                   s.unit_cost::numeric, s.qty, s.qty,
                   NULLIF(s.mfg, '')::date, NULLIF(s.exp, '')::date, now()
            FROM src s, reserve r, mov m
        ),
        -- 4. one movement line per batch
        ins_items AS (
            INSERT INTO stock_movement_items
                (id, movement_id, store_id, outlet_id, type, batch_id, product_id, variant_id, quantity, unit_cost)
            SELECT gen_random_uuid()::text, m.id, ${storeId}, ${outletId}, 'STOCK_IN'::"MovementType",
                   s.id, s.product_id, NULLIF(s.variant_id, ''), s.qty, s.unit_cost::numeric
            FROM src s, mov m
        ),
        -- the same item can appear on several lines: add them up so each stock row is touched once
        agg AS (
            SELECT s.product_id,
                   NULLIF(s.variant_id, '') AS variant_id,
                   COALESCE(NULLIF(s.variant_id, ''), s.product_id) AS item_key,
                   SUM(s.qty)::int AS qty
            FROM src s
            GROUP BY s.product_id, NULLIF(s.variant_id, ''), COALESCE(NULLIF(s.variant_id, ''), s.product_id)
        ),
        -- 5. live stock in this outlet
        upsert_stock AS (
            INSERT INTO outlet_stocks
                (id, store_id, outlet_id, product_id, variant_id, item_key, quantity, last_stocked_at, updated_at)
            SELECT gen_random_uuid()::text, ${storeId}, ${outletId},
                   a.product_id, a.variant_id, a.item_key, a.qty, now(), now()
            FROM agg a
            ON CONFLICT (store_id, outlet_id, item_key) DO UPDATE
            SET quantity = outlet_stocks.quantity + EXCLUDED.quantity,
                last_stocked_at = now(),
                updated_at = now()
        ),
        -- 6. total quantity on the variant, and on the product when it has no variants
        upd_variants AS (
            UPDATE product_variants v
            SET quantity = v.quantity + a.qty, updated_at = now()
            FROM agg a
            WHERE a.variant_id IS NOT NULL AND v.id = a.variant_id AND v.store_id = ${storeId}
        ),
        upd_products AS (
            UPDATE products p
            SET quantity = p.quantity + a.qty, updated_at = now()
            FROM agg a
            WHERE a.variant_id IS NULL AND p.id = a.product_id AND p.store_id = ${storeId}
        )
        SELECT m.id, m.created_at AS "createdAt", r.first AS "first"
        FROM mov m, reserve r
    `;

  // No row back = the store doesn't exist (the reserve step matched nothing)
  if (!row) throw Object.assign(new Error("Store not found"), { code: "P2025" });

  const batches = lines.map((l, i) => ({
    id: batchIds[i],
    batchNumber: row.first + i,
    productId: l.productId,
    variantId: l.variantId ?? null,
    quantity: l.quantity,
    unitCost: l.unitCost,
    expiryDate: l.expiryDate ?? null,
  }));

  return { movement: { id: row.id, createdAt: row.createdAt }, batches };
};


const movementListSelect = {
  id: true,
  type: true,
  referenceNumber: true,
  totalProducts: true,
  totalQuantity: true,
  totalCost: true,
  createdAt: true,
  outlet: { select: { id: true, name: true } },
  otherOutlet: { select: { id: true, name: true } }, // transfers: where it went or came from
  performedBy: { select: { id: true, fullName: true } },
};

export const getMovementsModel = async (storeId, { page, limit, outletId, type, from, to }) => {
  const where = {
    storeId,
    ...(outletId && { outletId }),
    ...(type && { type }),
    ...((from || to) && {
      createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) },
    }),
  };

  // The list and the count are independent, so they run at the same time
  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      select: movementListSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], // id keeps pages stable when times tie
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return { items, total };
};



const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

export const getStockModel = async (storeId, { page, limit, search, outletId, status }) => {
  // Everything that can be stocked: base products and every variant of variant products
  const itemsCte = Prisma.sql`
        today AS (SELECT (now() AT TIME ZONE 'Asia/Kathmandu')::date AS d),
        items AS (
            SELECT p.id AS product_id, NULL::text AS variant_id, p.id AS item_key,
                   p.name AS name, p.sku AS sku, p.stock_status::text AS status
            FROM products p
            WHERE p.store_id = ${storeId} AND NOT p.has_variants AND p.status <> 'ARCHIVED'
            UNION ALL
            SELECT v.product_id, v.id, v.id, p.name || ' — ' || v.name, v.sku, v.stock_status::text
            FROM product_variants v
            JOIN products p ON p.id = v.product_id AND p.store_id = v.store_id
            WHERE v.store_id = ${storeId} AND p.has_variants AND p.status <> 'ARCHIVED'
        )`;

  const searchSql = search
    ? Prisma.sql`AND (i.name ILIKE ${`%${escapeLike(search)}%`} OR i.sku ILIKE ${`%${escapeLike(search)}%`})`
    : Prisma.empty;

  // With an outlet filter, the status is that outlet's status
  const statusSql = !status
    ? Prisma.empty
    : outletId
      ? Prisma.sql`AND COALESCE((SELECT os.stock_status::text FROM outlet_stocks os
                                     WHERE os.outlet_id = ${outletId} AND os.item_key = i.item_key), 'OUT_OF_STOCK') = ${status}`
      : Prisma.sql`AND i.status = ${status}`;

  const outletSql = outletId ? Prisma.sql`AND o.id = ${outletId}` : Prisma.empty;
  const offset = (page - 1) * limit;

  const pageQuery = prisma.$queryRaw(Prisma.sql`
        WITH ${itemsCte}
        SELECT f.product_id AS "productId", f.variant_id AS "variantId", f.name, f.sku, f.status,
               COALESCE(agg.outlets, '[]'::json) AS outlets
        FROM (
            SELECT i.* FROM items i
            WHERE TRUE ${searchSql} ${statusSql}
            ORDER BY i.name, i.item_key
            LIMIT ${limit} OFFSET ${offset}
        ) f
        LEFT JOIN LATERAL (
            SELECT json_agg(json_build_object(
                       'outletId', x.outlet_id, 'outletName', x.outlet_name, 'quantity', x.qty,
                       'status', x.status, 'batchCount', x.batch_count, 'totalCost', x.total_cost
                   ) ORDER BY x.is_main DESC, x.outlet_name) AS outlets
            FROM (
                SELECT o.id AS outlet_id, o.name AS outlet_name, o.is_main,
                       COALESCE(os.quantity, 0) AS qty,
                       COALESCE(os.stock_status::text, 'OUT_OF_STOCK') AS status,
                       COALESCE(b.batch_count, 0) AS batch_count,
                       COALESCE(b.total_cost, 0) AS total_cost
                FROM outlets o
                LEFT JOIN outlet_stocks os ON os.outlet_id = o.id AND os.item_key = f.item_key
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::int AS batch_count,
                           SUM(sb.remaining_quantity * sb.unit_cost) AS total_cost
                    FROM stock_batches sb
                    WHERE sb.outlet_id = o.id
                      AND sb.product_id = f.product_id
                      AND (sb.variant_id = f.variant_id OR (f.variant_id IS NULL AND sb.variant_id IS NULL))
                      AND sb.remaining_quantity > 0
                      AND (sb.expiry_date IS NULL OR sb.expiry_date >= (SELECT d FROM today))
                ) b ON TRUE
                WHERE o.store_id = ${storeId} ${outletSql}
                  AND (COALESCE(os.quantity, 0) > 0 OR COALESCE(b.batch_count, 0) > 0)
            ) x
        ) agg ON TRUE
        ORDER BY f.name, f.variant_id NULLS FIRST
    `);

  const countQuery = prisma.$queryRaw(Prisma.sql`
        WITH ${itemsCte}
        SELECT COUNT(*)::int AS total FROM items i WHERE TRUE ${searchSql} ${statusSql}
    `);

  const [items, [{ total }]] = await Promise.all([pageQuery, countQuery]);
  return { items, total };
};



// One statement, one row per variant (or one row for a product without variants).
// Each row carries that variant's totals and its page of batches as JSON.
// page and limit apply PER VARIANT.
export const getItemBatchesModel = async (storeId, productId, { page, limit, variantId, outletId, onlyAvailable }) => {
    const variantSql = variantId ? Prisma.sql`AND v.id = ${variantId}` : Prisma.empty;
    const outletSql = outletId ? Prisma.sql`AND b.outlet_id = ${outletId}` : Prisma.empty;
    const availableSql = onlyAvailable ? Prisma.sql`AND b.remaining_quantity > 0` : Prisma.empty;

    // the batches that belong to one unit (a variant, or the product itself)
    const matchSql = Prisma.sql`
        b.store_id = ${storeId} AND b.product_id = u.product_id
        AND ((u.variant_id IS NULL AND b.variant_id IS NULL) OR b.variant_id = u.variant_id)
        ${outletSql} ${availableSql}`;

    return prisma.$queryRaw(Prisma.sql`
        WITH
        prod AS (
            SELECT id, name, has_variants FROM products WHERE id = ${productId} AND store_id = ${storeId}
        ),
        units AS (
            SELECT p.id AS product_id, NULL::text AS variant_id, NULL::text AS variant_name
            FROM prod p WHERE NOT p.has_variants
            UNION ALL
            SELECT p.id, v.id, v.name
            FROM prod p
            JOIN product_variants v ON v.product_id = p.id AND v.store_id = ${storeId}
            WHERE p.has_variants ${variantSql}
        )
        SELECT p.id AS "productId", p.name AS "productName", p.has_variants AS "hasVariants",
               (u.product_id IS NOT NULL) AS "hasUnit",
               u.variant_id AS "variantId", u.variant_name AS "variantName",
               s.batch_count AS "batchCount", s.received, s.remaining, s.cost,
               COALESCE(bt.batches, '[]'::json) AS batches
        FROM prod p
        LEFT JOIN units u ON TRUE
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS batch_count,
                   COALESCE(SUM(b.quantity), 0)::int AS received,
                   COALESCE(SUM(b.remaining_quantity), 0)::int AS remaining,
                   COALESCE(SUM(b.quantity * b.unit_cost), 0)::text AS cost
            FROM stock_batches b
            WHERE ${matchSql}
        ) s ON u.product_id IS NOT NULL
        LEFT JOIN LATERAL (
            SELECT json_agg(json_build_object(
                       'id', x.id, 'batchNumber', x.batch_number,
                       'outletId', x.outlet_id, 'outletName', x.outlet_name,
                       'unitCost', x.unit_cost, 'totalCost', x.total_cost,
                       'received', x.quantity, 'remaining', x.remaining_quantity,
                       'expiryDate', x.expiry_date, 'createdAt', x.created_at
                   ) ORDER BY x.sort_at DESC, x.id DESC) AS batches
            FROM (
                SELECT b.id, b.batch_number, b.outlet_id, o.name AS outlet_name,
                       b.unit_cost::text AS unit_cost,
                       (b.quantity * b.unit_cost)::text AS total_cost,
                       b.quantity, b.remaining_quantity, b.expiry_date,
                       b.created_at AS sort_at,
                       to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
                FROM stock_batches b
                JOIN outlets o ON o.id = b.outlet_id
                WHERE ${matchSql}
                ORDER BY b.created_at DESC, b.id DESC
                LIMIT ${limit} OFFSET ${(page - 1) * limit}
            ) x
        ) bt ON u.product_id IS NOT NULL
        ORDER BY u.variant_name NULLS FIRST, u.variant_id
    `);
};