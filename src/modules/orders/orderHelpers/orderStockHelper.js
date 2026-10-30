import { randomUUID } from "crypto";
import { fromCents, toCents } from "../../../utils/money.js";

// Locks the stock rows in a fixed order and returns the sellable units per (outlet, item)
export const lockAvailability = async (tx, storeId, outletIds, itemKeys) => {
    const rows = await tx.$queryRaw`
        SELECT outlet_id AS "outletId", item_key AS "itemKey", quantity
        FROM outlet_stocks
        WHERE store_id = ${storeId}
          AND outlet_id = ANY(${outletIds}::text[])
          AND item_key = ANY(${itemKeys}::text[])
        ORDER BY outlet_id, item_key
        FOR UPDATE
    `;
    return new Map(rows.map((r) => [`${r.outletId}|${r.itemKey}`, r.quantity]));
};

// Locks the batches that will get units back (same ordering as picking, to avoid deadlocks)
export const lockBatches = async (tx, storeId, batchIds) => {
    if (batchIds.length === 0) return;
    await tx.$queryRaw`
        SELECT id FROM stock_batches
        WHERE store_id = ${storeId} AND id = ANY(${batchIds}::text[])
        ORDER BY outlet_id, COALESCE(variant_id, product_id), expiry_date NULLS LAST, created_at, id
        FOR UPDATE
    `;
};

// Earliest expiry first, expired batches skipped
export const pickBatches = async (tx, storeId, needList) => {
    const rows = await tx.$queryRaw`
        SELECT b.id, b.outlet_id AS "outletId", COALESCE(b.variant_id, b.product_id) AS "itemKey",
               b.remaining_quantity AS remaining, b.unit_cost::text AS "unitCost"
        FROM stock_batches b
        JOIN unnest(${needList.map((n) => n.outletId)}::text[], ${needList.map((n) => n.itemKey)}::text[])
             AS n(outlet_id, item_key)
          ON b.outlet_id = n.outlet_id AND COALESCE(b.variant_id, b.product_id) = n.item_key
        WHERE b.store_id = ${storeId}
          AND b.remaining_quantity > 0
          AND (b.expiry_date IS NULL OR b.expiry_date >= (now() AT TIME ZONE 'Asia/Kathmandu')::date)
        ORDER BY b.outlet_id, COALESCE(b.variant_id, b.product_id), b.expiry_date NULLS LAST, b.created_at, b.id
        FOR UPDATE OF b
    `;

    const byNeed = new Map();
    for (const b of rows) {
        const k = `${b.outletId}|${b.itemKey}`;
        if (!byNeed.has(k)) byNeed.set(k, []);
        byNeed.get(k).push(b);
    }

    const picks = [];
    for (const need of needList) {
        let left = need.qty;
        for (const b of byNeed.get(`${need.outletId}|${need.itemKey}`) ?? []) {
            if (left === 0) break;
            const take = Math.min(b.remaining, left);
            picks.push({
                batchId: b.id, outletId: need.outletId, productId: need.productId, variantId: need.variantId,
                itemKey: need.itemKey, quantity: take, unitCost: b.unitCost, sellable: true,
            });
            left -= take;
        }
        if (left > 0) throw Object.assign(new Error("Stock batches out of sync"), { code: "STOCK_OUT_OF_SYNC" });
    }
    return picks;
};
// picks: [{ type: "STOCK_OUT" | "STOCK_RESTORE", sign: -1 | +1, batchId, outletId, productId, variantId,
//           itemKey, quantity, unitCost, sellable }]
// One movement per (type, outlet), one line per batch. Three queries in total.
export const recordMovements = async (tx, { storeId, userId, orderId, orderNumber, picks, note }) => {
    if (picks.length === 0) return;

    const groups = new Map();
    for (const p of picks) {
        const k = `${p.type}|${p.outletId}`;
        if (!groups.has(k)) groups.set(k, { id: randomUUID(), type: p.type, outletId: p.outletId, list: [] });
        groups.get(k).list.push(p);
    }

    // Names are copied from the batch each line points to. One lookup covers STOCK_OUT and STOCK_RESTORE.
    const batchRows = await tx.stockBatch.findMany({
        where: { id: { in: [...new Set(picks.map((p) => p.batchId))] }, storeId },
        select: { id: true, productName: true, variantName: true, sku: true },
    });
    const snapshotByBatch = new Map(batchRows.map((b) => [b.id, b]));

    await tx.stockMovement.createMany({
        data: [...groups.values()].map((g) => ({
            id: g.id, storeId, outletId: g.outletId, type: g.type, orderId, note,
            referenceNumber: `#${orderNumber}`,
            performedById: userId,
            totalQuantity: g.list.reduce((s, p) => s + p.quantity, 0),
            totalCost: fromCents(g.list.reduce((s, p) => s + p.quantity * toCents(p.unitCost), 0)),
            totalProducts: new Set(g.list.map((p) => p.itemKey)).size,
        })),
    });

    await tx.stockMovementItem.createMany({
        data: [...groups.values()].flatMap((g) =>
            g.list.map((p) => {
                const s = snapshotByBatch.get(p.batchId);
                if (!s) throw Object.assign(new Error("Batch missing"), { code: "STOCK_OUT_OF_SYNC" });
                return {
                    movementId: g.id, storeId, outletId: p.outletId, type: g.type,
                    batchId: p.batchId, productId: p.productId, variantId: p.variantId,
                    productName: s.productName,
                    variantName: s.variantName,
                    sku: s.sku,
                    quantity: p.quantity, unitCost: p.unitCost,
                };
            })
        ),
    });
};

// One statement for batches, outlet stock and the variant / product totals.
// Each pick has its own sign: -1 = units leave (sale), +1 = units come back.
// Restored units of an EXPIRED batch go to expired_quantity, not sellable stock.
export const applyStock = async (tx, storeId, picks) => {
    if (picks.length === 0) return;

    const batches = new Map();
    const stock = new Map();
    const variants = new Map();
    const products = new Map();

    for (const p of picks) {
        const signed = p.sign * p.quantity;
        const expired = p.sellable === false;
        const sell = expired ? 0 : signed;

        batches.set(p.batchId, (batches.get(p.batchId) ?? 0) + signed);

        const k = `${p.outletId}|${p.itemKey}`;
        const s = stock.get(k) ?? { outletId: p.outletId, itemKey: p.itemKey, sell: 0, exp: 0, sold: false };
        s.sell += sell;
        s.exp += expired && p.sign > 0 ? p.quantity : 0;
        s.sold = s.sold || p.sign < 0;
        stock.set(k, s);

        const target = p.variantId ? variants : products;
        const id = p.variantId ?? p.productId;
        target.set(id, (target.get(id) ?? 0) + sell);
    }
    const rows = [...stock.values()];

    const [res] = await tx.$queryRaw`
        WITH
        upd_batches AS (
            UPDATE stock_batches b
            SET remaining_quantity = b.remaining_quantity + t.qty, updated_at = now()
            FROM unnest(${[...batches.keys()]}::text[], ${[...batches.values()]}::int[]) AS t(id, qty)
            WHERE b.id = t.id AND b.store_id = ${storeId}
            RETURNING b.id
        ),
        upd_stock AS (
            UPDATE outlet_stocks os
            SET quantity = os.quantity + s.sell,
                expired_quantity = os.expired_quantity + s.exp,
                last_sold_at = CASE WHEN s.sold THEN now() ELSE os.last_sold_at END,
                updated_at = now()
            FROM unnest(${rows.map((r) => r.outletId)}::text[], ${rows.map((r) => r.itemKey)}::text[],
                        ${rows.map((r) => r.sell)}::int[], ${rows.map((r) => r.exp)}::int[],
                        ${rows.map((r) => r.sold)}::boolean[]) AS s(outlet_id, item_key, sell, exp, sold)
            WHERE os.outlet_id = s.outlet_id AND os.item_key = s.item_key
            RETURNING os.id
        ),
        upd_variants AS (
            UPDATE product_variants v
            SET quantity = v.quantity + a.qty, updated_at = now()
            FROM unnest(${[...variants.keys()]}::text[], ${[...variants.values()]}::int[]) AS a(id, qty)
            WHERE v.id = a.id AND v.store_id = ${storeId}
            RETURNING v.id
        ),
        upd_products AS (
            UPDATE products p
            SET quantity = p.quantity + a.qty, updated_at = now()
            FROM unnest(${[...products.keys()]}::text[], ${[...products.values()]}::int[]) AS a(id, qty)
            WHERE p.id = a.id AND p.store_id = ${storeId}
            RETURNING p.id
        )
        SELECT (SELECT count(*) FROM upd_batches)::int AS batches,
               (SELECT count(*) FROM upd_stock)::int AS stock,
               (SELECT count(*) FROM upd_variants)::int AS variants,
               (SELECT count(*) FROM upd_products)::int AS products
    `;

    if (res.batches !== batches.size || res.stock !== rows.length
        || res.variants !== variants.size || res.products !== products.size) {
        throw Object.assign(new Error("Stock rows out of sync"), { code: "STOCK_OUT_OF_SYNC" });
    }
};


// Restores for products or variants that were deleted are skipped:
// their stock rows are gone and their batches were written off.
export const keepLiveRestores = async (tx, storeId, restores) => {
    if (restores.length === 0) return restores;

    const productIds = [...new Set(restores.map((r) => r.productId))];
    const variantIds = [...new Set(restores.map((r) => r.variantId).filter(Boolean))];

    const [products, variants] = await Promise.all([
        tx.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true } }),
        variantIds.length
            ? tx.productVariant.findMany({ where: { storeId, id: { in: variantIds } }, select: { id: true } })
            : [],
    ]);

    const liveProducts = new Set(products.map((p) => p.id));
    const liveVariants = new Set(variants.map((v) => v.id));

    return restores.filter(
        (r) => liveProducts.has(r.productId) && (!r.variantId || liveVariants.has(r.variantId))
    );
};