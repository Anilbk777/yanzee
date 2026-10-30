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
//
// The product / variant name is copied into the batch and the lines INSIDE this statement,
// so the snapshot always matches the row that was live at the moment of saving.
// If the product or the chosen variant was deleted after validation, the name is NULL,
// the NOT NULL on product_name fails (code 23502) and everything rolls back.
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
        -- 3. one batch per line, with the snapshot copied from the live product / variant
        ins_batches AS (
            INSERT INTO stock_batches
                (id, store_id, batch_number, supplier_lot, movement_id, product_id, variant_id, outlet_id,
                 product_name, variant_name, sku, meta,
                 unit_cost, quantity, remaining_quantity, manufacture_date, expiry_date, updated_at)
            SELECT s.id, ${storeId}, r.first + s.ord::int - 1, NULLIF(s.supplier_lot, ''), m.id,
                   s.product_id, NULLIF(s.variant_id, ''), ${outletId},
                   -- NULL on purpose when the product or the chosen variant no longer exists
                   CASE WHEN p.id IS NULL OR (s.variant_id <> '' AND v.id IS NULL)
                        THEN NULL ELSE p.name END,
                   v.name,
                   CASE WHEN v.id IS NOT NULL THEN v.sku ELSE p.sku END,
                   jsonb_build_object(
                       'image', COALESCE(v.image_urls[1], p.image_urls[1]),
                       'sellingPrice', COALESCE(v.selling_price, p.selling_price, 0),
                       'crossedPrice', COALESCE(v.crossed_price, p.crossed_price, 0)
                   ),
                   s.unit_cost::numeric, s.qty, s.qty,
                   NULLIF(s.mfg, '')::date, NULLIF(s.exp, '')::date, now()
            FROM src s
            JOIN reserve r ON true
            JOIN mov m ON true
            LEFT JOIN products p
                   ON p.id = s.product_id AND p.store_id = ${storeId}
            LEFT JOIN product_variants v
                   ON v.id = NULLIF(s.variant_id, '') AND v.store_id = ${storeId}
            RETURNING id, product_id, variant_id, product_name, variant_name, sku, quantity, unit_cost
        ),
        -- 4. one movement line per batch, copied from the batch that was just inserted
        ins_items AS (
            INSERT INTO stock_movement_items
                (id, movement_id, store_id, outlet_id, type, batch_id,
                 product_id, variant_id, product_name, variant_name, sku, quantity, unit_cost)
            SELECT gen_random_uuid()::text, m.id, ${storeId}, ${outletId}, 'STOCK_IN'::"MovementType",
                   b.id, b.product_id, b.variant_id, b.product_name, b.variant_name, b.sku,
                   b.quantity, b.unit_cost
            FROM ins_batches b, mov m
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
        SELECT m.id, m.created_at AS "createdAt"
        FROM mov m
    `;

  // No row back = the store doesn't exist (the reserve step matched nothing)
  if (!row) throw Object.assign(new Error("Store not found"), { code: "P2025" });

  return { movement: { id: row.id, createdAt: row.createdAt } };
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



const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const getStockModel = async (storeId, { page, limit, search, outletId, status }) => {
  // "today" in Nepal time, as UTC midnight (assumes expiryDate is a @db.Date column)
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
  const today = new Date(`${todayStr}T00:00:00.000Z`);

  const like = search ? { contains: search, mode: "insensitive" } : null;
  // without an outlet filter, the status filter applies to the item's own status
  const itemStatus = status && !outletId ? { stockStatus: status } : {};

  // wave 1: everything that decides WHICH items are on the page (parallel)
  const [products, variants, outlets, outletStatusRows] = await Promise.all([
    prisma.product.findMany({
      where: {
        storeId, hasVariants: false, status: { not: "ARCHIVED" },
        ...(like ? { OR: [{ name: like }, { sku: like }] } : {}),
        ...itemStatus,
      },
      select: { id: true, name: true, sku: true, stockStatus: true },
    }),

    prisma.productVariant.findMany({
      where: {
        storeId,
        product: { is: { hasVariants: true, status: { not: "ARCHIVED" } } },
        ...(like ? { OR: [{ name: like }, { sku: like }, { product: { is: { name: like } } }] } : {}),
        ...itemStatus,
      },
      select: {
        id: true, productId: true, name: true, sku: true, stockStatus: true,
        product: { select: { name: true } },
      },
    }),

    prisma.outlet.findMany({
      where: { storeId, ...(outletId ? { id: outletId } : {}) },
      select: { id: true, name: true },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    }),

    // with an outlet filter, the status is that outlet's status
    status && outletId
      ? prisma.outletStock.findMany({ where: { outletId }, select: { itemKey: true, stockStatus: true } })
      : [],
  ]);

  const outletStatus = new Map(outletStatusRows.map((r) => [r.itemKey, r.stockStatus]));

  // merge both lists, filter, sort (this replaces UNION ALL + ORDER BY)
  const all = [
    ...products.map((p) => ({
      productId: p.id, variantId: null, itemKey: p.id,
      name: p.name, sku: p.sku, status: p.stockStatus,
    })),
    ...variants.map((v) => ({
      productId: v.productId, variantId: v.id, itemKey: v.id,
      name: `${v.product.name} — ${v.name}`, sku: v.sku, status: v.stockStatus,
    })),
  ]
    .filter((i) => !(status && outletId) || (outletStatus.get(i.itemKey) ?? "OUT_OF_STOCK") === status)
    .sort((a, b) => a.name.localeCompare(b.name) || cmp(a.itemKey, b.itemKey));

  const total = all.length;
  const pageItems = all.slice((page - 1) * limit, page * limit);
  if (pageItems.length === 0) return { items: [], total };

  const keys = pageItems.map((i) => i.itemKey);
  const productIds = [...new Set(pageItems.map((i) => i.productId))];
  const outletIds = outlets.map((o) => o.id);

  // wave 2: the per-outlet numbers, only for the items on this page (parallel)
  const [stocks, batchGroups] = await Promise.all([
    prisma.outletStock.findMany({
      where: { outletId: { in: outletIds }, itemKey: { in: keys } },
      select: { outletId: true, itemKey: true, quantity: true, stockStatus: true },
    }),

    // grouped by unitCost so we can compute sum(remaining * unit_cost) in JS
    prisma.stockBatch.groupBy({
      by: ["outletId", "productId", "variantId", "unitCost"],
      where: {
        storeId,
        outletId: { in: outletIds },
        productId: { in: productIds },
        remainingQuantity: { gt: 0 },
        OR: [{ expiryDate: null }, { expiryDate: { gte: today } }],
      },
      _count: { _all: true },
      _sum: { remainingQuantity: true },
    }),
  ]);

  const stockMap = new Map(stocks.map((s) => [`${s.outletId}|${s.itemKey}`, s]));

  const batchMap = new Map();
  for (const g of batchGroups) {
    const key = `${g.outletId}|${g.variantId ?? g.productId}`;
    const cur = batchMap.get(key) ?? { count: 0, cost: new Prisma.Decimal(0) };
    cur.count += g._count._all;
    cur.cost = cur.cost.plus(g.unitCost.mul(g._sum.remainingQuantity ?? 0));
    batchMap.set(key, cur);
  }

  const items = pageItems.map((i) => ({
    productId: i.productId,
    variantId: i.variantId,
    name: i.name,
    sku: i.sku,
    status: i.status,
    outlets: outlets.flatMap((o) => {
      const s = stockMap.get(`${o.id}|${i.itemKey}`);
      const b = batchMap.get(`${o.id}|${i.itemKey}`);
      const quantity = s?.quantity ?? 0;
      const batchCount = b?.count ?? 0;
      if (!(quantity > 0 || batchCount > 0)) return []; // same rule as the SQL's WHERE
      return [{
        outletId: o.id,
        outletName: o.name,
        quantity,
        status: s?.stockStatus ?? "OUT_OF_STOCK",
        batchCount,
        totalCost: b ? b.cost.toNumber() : 0, // a JSON number, as in the SQL
      }];
    }),
  }));

  return { items, total };
};


const toDateString = (d) => (d ? d.toISOString().slice(0, 10) : null);
export const getItemBatchesModel = async (storeId, productId, { page, limit, variantId, outletId, onlyAvailable }) => {
  // filters shared by the totals and the batch pages
  const batchWhere = {
    storeId,
    productId,
    ...(outletId ? { outletId } : {}),
    ...(onlyAvailable ? { remainingQuantity: { gt: 0 } } : {}),
  };

  // product and variants are independent, so run them in parallel
  const [product, variantRows] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, storeId },
      select: { id: true, name: true, hasVariants: true },
    }),
    prisma.productVariant.findMany({
      where: { productId, storeId, ...(variantId ? { id: variantId } : {}) },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
  ]);

  if (!product) return []; // the SQL also returns zero rows here

  const base = { productId: product.id, productName: product.name, hasVariants: product.hasVariants };

  // a product without variants is a single unit; the variantId filter only applies to products with variants
  const units = product.hasVariants ? variantRows : [{ id: null, name: null }];

  if (units.length === 0) {
    // variants exist, but the variantId filter matched none
    return [{
      ...base, hasUnit: false, variantId: null, variantName: null,
      batchCount: null, received: null, remaining: null, cost: null, batches: [],
    }];
  }

  const [costGroups, ...pages] = await Promise.all([
    // totals for every unit in one query (see note below on why it groups by unitCost)
    prisma.stockBatch.groupBy({
      by: ["variantId", "unitCost"],
      where: batchWhere,
      _count: { _all: true },
      _sum: { quantity: true, remainingQuantity: true },
    }),

    // one page of batches per unit, all in parallel
    ...units.map((u) =>
      prisma.stockBatch.findMany({
        where: { ...batchWhere, variantId: u.id }, // null becomes IS NULL
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, batchNumber: true, outletId: true,
          unitCost: true, quantity: true, remainingQuantity: true,
          expiryDate: true, createdAt: true,
          outlet: { select: { name: true } },
        },
      })
    ),
  ]);

  // fold the (variant, unitCost) groups into per-unit totals
  const totals = new Map();
  for (const g of costGroups) {
    const key = g.variantId ?? "__none__";
    const t = totals.get(key) ?? { count: 0, received: 0, remaining: 0, cost: new Prisma.Decimal(0) };
    const received = g._sum.quantity ?? 0;
    t.count += g._count._all;
    t.received += received;
    t.remaining += g._sum.remainingQuantity ?? 0;
    t.cost = t.cost.plus(new Prisma.Decimal(g.unitCost).mul(received)); // sum(q * c) = c * sum(q) for one cost
    totals.set(key, t);
  }

  return units.map((u, i) => {
    const t = totals.get(u.id ?? "__none__") ?? { count: 0, received: 0, remaining: 0, cost: new Prisma.Decimal(0) };
    return {
      ...base,
      hasUnit: true,
      variantId: u.id,
      variantName: u.name,
      batchCount: t.count,
      received: t.received,
      remaining: t.remaining,
      cost: t.cost.toFixed(2),
      batches: pages[i].map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        outletId: b.outletId,
        outletName: b.outlet.name,
        unitCost: b.unitCost.toFixed(2),
        totalCost: b.unitCost.mul(b.quantity).toFixed(2),
        received: b.quantity,
        remaining: b.remainingQuantity,
        expiryDate: toDateString(b.expiryDate),
        createdAt: b.createdAt.toISOString(),
      })),
    };
  });
};

const D = (v) => new Prisma.Decimal(v ?? 0);
const DAY = 86400000;
// const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

export const getInventoryOverviewModel = async (
  storeId,
  { outletId, lowStockThreshold, expiringDays, fastMovingDays, listLimit }
) => {
  // "today" in Nepal time, as UTC midnight so it compares cleanly with DATE columns
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
  const today = new Date(`${todayStr}T00:00:00.000Z`).getTime();
  const expiringEnd = today + expiringDays * DAY;
  const since = new Date(Date.now() - fastMovingDays * DAY);

  // 5 independent queries, sent in parallel
  const [outlet, plainProducts, variants, batches, soldRows] = await Promise.all([
    outletId
      ? prisma.outlet.findFirst({ where: { id: outletId, storeId }, select: { id: true, name: true } })
      : null,

    prisma.product.findMany({
      where: { storeId, hasVariants: false, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, sku: true, sellingPrice: true },
    }),

    prisma.productVariant.findMany({
      where: { storeId, product: { is: { hasVariants: true, status: { not: "ARCHIVED" } } } },
      select: {
        id: true, name: true, sku: true, sellingPrice: true,
        product: { select: { id: true, name: true } },
      },
    }),

    prisma.stockBatch.findMany({
      where: {
        storeId,
        remainingQuantity: { gt: 0 },
        ...(outletId ? { outletId } : { outlet: { isActive: true } }),
      },
      select: { productId: true, variantId: true, remainingQuantity: true, unitCost: true, expiryDate: true },
    }),

    prisma.stockMovementItem.groupBy({
      by: ["productId", "variantId", "type"],
      where: {
        storeId,
        type: { in: ["STOCK_OUT", "STOCK_RESTORE"] },
        createdAt: { gte: since },
        ...(outletId ? { outletId } : {}),
      },
      _sum: { quantity: true },
    }),
  ]);

  // outlet not in this store -> the service answers 404
  if (outletId && !outlet) return { outlet: null };

  // ---- items: one entry per stockable item ----
  const levels = new Map();
  const makeLevel = (productId, variantId, productName, variantName, sku, price) => ({
    productId, variantId, itemKey: variantId ?? productId,
    productName, variantName, sku, price: D(price),
    qty: 0, costValue: D(0),
    expiringQty: 0, expiringCost: D(0), nextExpiry: null,
    expiredQty: 0, expiredCost: D(0), oldestExpired: null,
  });
  for (const p of plainProducts) levels.set(p.id, makeLevel(p.id, null, p.name, null, p.sku, p.sellingPrice));
  for (const v of variants) levels.set(v.id, makeLevel(v.product.id, v.id, v.product.name, v.name, v.sku, v.sellingPrice));

  // ---- one pass over live batches ----
  for (const b of batches) {
    const lv = levels.get(b.variantId ?? b.productId);
    if (!lv) continue; // archived product, same as the LEFT JOIN from items
    const qty = b.remainingQuantity;
    const cost = D(b.unitCost).mul(qty);
    const exp = b.expiryDate ? b.expiryDate.getTime() : null;

    if (exp === null || exp >= today) {
      lv.qty += qty;
      lv.costValue = lv.costValue.plus(cost);
    }
    if (exp !== null && exp >= today && exp <= expiringEnd) {
      lv.expiringQty += qty;
      lv.expiringCost = lv.expiringCost.plus(cost);
      if (lv.nextExpiry === null || exp < lv.nextExpiry) lv.nextExpiry = exp;
    }
    if (exp !== null && exp < today) {
      lv.expiredQty += qty;
      lv.expiredCost = lv.expiredCost.plus(cost);
      if (lv.oldestExpired === null || exp < lv.oldestExpired) lv.oldestExpired = exp;
    }
  }

  // ---- totals ----
  const t = {
    products: 0, quantity: 0, sellingValue: D(0), costValue: D(0),
    outOfStock: 0, lowStock: 0, inStock: 0,
    expiringItems: 0, expiringUnits: 0, expiringCost: D(0),
    expiredItems: 0, expiredUnits: 0, expiredCost: D(0),
  };
  for (const l of levels.values()) {
    t.products++;
    t.quantity += l.qty;
    t.sellingValue = t.sellingValue.plus(l.price.mul(l.qty));
    t.costValue = t.costValue.plus(l.costValue);
    if (l.qty === 0) t.outOfStock++;
    else if (l.qty < lowStockThreshold) t.lowStock++;
    if (l.qty >= lowStockThreshold) t.inStock++;
    if (l.expiringQty > 0) { t.expiringItems++; t.expiringUnits += l.expiringQty; t.expiringCost = t.expiringCost.plus(l.expiringCost); }
    if (l.expiredQty > 0) { t.expiredItems++; t.expiredUnits += l.expiredQty; t.expiredCost = t.expiredCost.plus(l.expiredCost); }
  }

  // ---- fast moving: net units sold in the window ----
  const units = new Map();
  for (const r of soldRows) {
    const key = r.variantId ?? r.productId;
    const n = r._sum.quantity ?? 0;
    units.set(key, (units.get(key) ?? 0) + (r.type === "STOCK_OUT" ? n : -n));
  }
  const moving = [...units]
    .filter(([key, u]) => u > 0 && levels.has(key))
    .map(([key, u]) => ({ ...levels.get(key), units: u }))
    .sort((a, b) => b.units - a.units || cmp(a.productName, b.productName) || cmp(a.itemKey, b.itemKey));
  const totalSold = moving.reduce((s, f) => s + f.units, 0);

  // ---- expiry lists ----
  const expiring = [...levels.values()]
    .filter((l) => l.expiringQty > 0)
    .sort((a, b) => a.nextExpiry - b.nextExpiry || b.expiringCost.comparedTo(a.expiringCost) || cmp(a.itemKey, b.itemKey));
  const expired = [...levels.values()]
    .filter((l) => l.expiredQty > 0)
    .sort((a, b) => b.expiredCost.comparedTo(a.expiredCost) || a.oldestExpired - b.oldestExpired || cmp(a.itemKey, b.itemKey));

  const ident = (l) => ({
    productId: l.productId, variantId: l.variantId,
    productName: l.productName, variantName: l.variantName, sku: l.sku,
  });

  return {
    outlet,
    totals: {
      products: t.products, quantity: t.quantity,
      sellingValue: t.sellingValue.toFixed(2), costValue: t.costValue.toFixed(2),
      inStock: t.inStock, lowStock: t.lowStock, outOfStock: t.outOfStock,
      expiringItems: t.expiringItems, expiringUnits: t.expiringUnits, expiringCost: t.expiringCost.toFixed(2),
      expiredItems: t.expiredItems, expiredUnits: t.expiredUnits, expiredCost: t.expiredCost.toFixed(2),
    },
    fastSummary: { movingItems: moving.length, unitsSold: totalSold },
    fastMoving: moving.slice(0, listLimit).map((f) => ({
      ...ident(f),
      unitsSold: f.units,
      sharePercent: Math.round((1000 * f.units) / totalSold) / 10,
      currentQuantity: f.qty,
      daysOfStock: Math.round((f.qty * fastMovingDays) / f.units),
    })),
    expiringSoon: expiring.slice(0, listLimit).map((e) => ({
      ...ident(e),
      units: e.expiringQty, costValue: e.expiringCost.toFixed(2),
      nextExpiryDate: day(e.nextExpiry), daysLeft: Math.round((e.nextExpiry - today) / DAY),
    })),
    expired: expired.slice(0, listLimit).map((x) => ({
      ...ident(x),
      units: x.expiredQty, costValue: x.expiredCost.toFixed(2),
      oldestExpiryDate: day(x.oldestExpired), daysExpired: Math.round((today - x.oldestExpired) / DAY),
    })),
  };
};

