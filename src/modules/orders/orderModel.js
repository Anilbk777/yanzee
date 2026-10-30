import { randomUUID } from "crypto";
import prisma from "../../config/dbConfig.js";
import { Prisma } from "../../../generated/prisma/index.js";
import { fromCents, toCents } from "../../utils/money.js";
import { allocateStock, splitLines } from "./orderAllocation.js";
import logger from "../../utils/logger.js";


const orderSelect = {
    id: true, orderNumber: true, channel: true, status: true,
    customerName: true, customerPhone: true,
    subtotal: true, discount: true, deliveryFee: true, total: true,
    orderDiscountType: true, orderDiscountValue: true, orderDiscountAmount: true,
    paymentMethod: true, paymentStatus: true, paidAmount: true, createdAt: true,
    outlet: { select: { id: true, name: true } },
    items: {
        select: {
            id: true, productId: true, variantId: true, productName: true, variantName: true, sku: true,
            unitPrice: true, quantity: true, discountType: true, discountValue: true, discountAmount: true, lineTotal: true,
            outlet: { select: { id: true, name: true } },
        },
    },
};

const CHANNEL_FILTER = { POS: "POS", WEB: "WEBSITE" }; // ALL = no filter, so it includes ADMIN too

const listSelect = {
    id: true, orderNumber: true, status: true, channel: true,
    customerName: true, customerPhone: true, customerEmail: true,
    total: true, paymentMethod: true, paymentStatus: true,
    createdAt: true, updatedAt: true,
};

// ---------- reads before the transaction (independent, run together) ----------

export const getOrderRefsModel = async (storeId, customerId, productIds, variantIds) => {
    const [outlets, customer, products, variants] = await Promise.all([
        prisma.outlet.findMany({
            where: { storeId },
            select: { id: true, name: true, address: true, isMain: true, isActive: true },
        }),
        prisma.customer.findFirst({
            where: { id: customerId, storeId },
            select: { id: true, name: true, phone: true, email: true },
        }),
        prisma.product.findMany({
            where: { storeId, id: { in: productIds } },
            select: {
                id: true, name: true, sku: true, status: true, isAvailable: true, channel: true,
                hasVariants: true, sellingPrice: true, imageUrls: true,
            },
        }),
        variantIds.length
            ? prisma.productVariant.findMany({
                where: { storeId, productId: { in: productIds }, id: { in: variantIds } },
                select: { id: true, productId: true, name: true, sku: true, sellingPrice: true },
            })
            : Promise.resolve([]),
    ]);

    const variantsByProduct = new Map();
    for (const { productId, ...v } of variants) {
        if (!variantsByProduct.has(productId)) variantsByProduct.set(productId, []);
        variantsByProduct.get(productId).push(v);
    }

    return {
        outlets,
        customer,
        // same shape as before: each product has its `variants` array
        products: products.map((p) => ({ ...p, variants: variantsByProduct.get(p.id) ?? [] })),
    };
};

// ==================================== CREATE ORDER Model HELPERS ====================================

// 1. Order number: increments the store's counter and locks the store row until commit
const allocateNextOrderNumber = async (tx, storeId) => {
    const { nextOrderNumber } = await tx.store.update({
        where: { id: storeId },
        data: { nextOrderNumber: { increment: 1 } },
        select: { nextOrderNumber: true },
    });
    return nextOrderNumber - 1;
};

// 2. Lock and read stock availability for candidate outlets & items
const lockAndGetOutletStock = async (tx, storeId, outletIds, itemKeys) => {
    const locked = await tx.$queryRaw`
        SELECT outlet_id AS "outletId", item_key AS "itemKey", quantity
        FROM outlet_stocks
        WHERE store_id = ${storeId}
          AND outlet_id = ANY(${outletIds}::text[])
          AND item_key = ANY(${itemKeys}::text[])
        ORDER BY outlet_id, item_key
        FOR UPDATE
    `;
    return new Map(locked.map((r) => [`${r.outletId}|${r.itemKey}`, r.quantity]));
};

// 3. Allocate stock across outlets, split order lines, and aggregate per-outlet item needs
const planStockAllocation = ({ lines, availability, outletIds, preferredOutletId }) => {
    const { assignments, shortages } = allocateStock({ lines, availability, outletIds, preferredOutletId });
    if (shortages.length > 0) {
        throw Object.assign(new Error("Not enough stock"), { code: "STOCK_SHORT", shortages });
    }

    const rows = splitLines(lines, assignments);

    const needs = new Map();
    for (const a of assignments) {
        const line = lines[a.index];
        const k = `${a.outletId}|${line.itemKey}`;
        const need = needs.get(k) ?? {
            outletId: a.outletId,
            itemKey: line.itemKey,
            productId: line.productId,
            variantId: line.variantId,
            qty: 0,
        };
        need.qty += a.quantity;
        needs.set(k, need);
    }

    return { rows, needList: [...needs.values()] };
};

// 4. Lock candidate batches and pick units using FEFO (earliest expiry first, expired skipped)
const lockAndPickBatches = async (tx, storeId, needList) => {
    const batchRows = await tx.$queryRaw`
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

    const batchesByNeed = new Map();
    for (const b of batchRows) {
        const k = `${b.outletId}|${b.itemKey}`;
        if (!batchesByNeed.has(k)) batchesByNeed.set(k, []);
        batchesByNeed.get(k).push(b);
    }

    const picks = [];
    for (const need of needList) {
        let left = need.qty;
        for (const b of batchesByNeed.get(`${need.outletId}|${need.itemKey}`) ?? []) {
            if (left === 0) break;
            const take = Math.min(b.remaining, left);
            picks.push({
                batchId: b.id,
                outletId: need.outletId,
                productId: need.productId,
                variantId: need.variantId,
                itemKey: need.itemKey,
                quantity: take,
                unitCost: b.unitCost,
            });
            left -= take;
        }
        if (left > 0) {
            throw Object.assign(new Error("Stock batches out of sync"), { code: "STOCK_OUT_OF_SYNC", itemKey: need.itemKey });
        }
    }

    return picks;
};

// 5. Insert the order record, line items, initial activity log, and payment entry
const insertOrderWithItemsAndActivity = async (tx, {
    storeId,
    userId,
    orderNumber,
    customerId,
    order,
    rows,
    payment,
    makeActivity,
}) => {
    const fulfilledFrom = [...rows.reduce((m, r) => m.set(r.outletId, (m.get(r.outletId) ?? 0) + r.quantity), new Map())]
        .map(([outletId, quantity]) => ({ outletId, quantity }));

    const created = await tx.order.create({
        data: {
            ...order,
            storeId,
            orderNumber,
            customerId,
            createdById: userId,
            items: {
                createMany: {
                    data: rows.map((r) => ({
                        productId: r.productId,
                        variantId: r.variantId,
                        outletId: r.outletId,
                        productName: r.productName,
                        variantName: r.variantName,
                        sku: r.sku,
                        image: r.image,
                        unitPrice: fromCents(r.unitCents),
                        quantity: r.quantity,
                        discountType: r.discountType,
                        discountValue: r.discountType === "FIXED" && r.discountCents > 0 ? fromCents(r.discountCents) : r.discountValue,
                        discountAmount: fromCents(r.discountCents),
                        lineTotal: fromCents(r.lineTotalCents),
                    })),
                },
            },
            activities: { create: makeActivity({ orderNumber, fulfilledFrom }) },
            ...(payment && {
                payments: {
                    create: {
                        kind: "PAYMENT",
                        method: payment.method,
                        status: "SUCCESS",
                        amount: payment.amount,
                        reference: payment.reference,
                        receivedById: userId,
                    },
                },
            }),
        },
        select: { id: true, orderNumber: true, customerName: true, customerPhone: true },
    });

    return { created, fulfilledFrom };
};

// 6. Record stock movements and deduct inventory from batches, outlet stocks, variants & products atomically
const applyOrderStockDeductions = async (tx, {
    storeId,
    userId,
    orderId,
    orderNumber,
    picks,
    needList,
}) => {
    const byOutlet = new Map();
    for (const p of picks) {
        if (!byOutlet.has(p.outletId)) byOutlet.set(p.outletId, []);
        byOutlet.get(p.outletId).push(p);
    }
    const movements = [...byOutlet].map(([outletId, list]) => ({
        id: randomUUID(),
        outletId,
        qty: list.reduce((s, p) => s + p.quantity, 0),
        cost: String(fromCents(list.reduce((s, p) => s + p.quantity * toCents(p.unitCost), 0))),
        products: new Set(list.map((p) => p.itemKey)).size,
    }));
    const movementIdByOutlet = new Map(movements.map((m) => [m.outletId, m.id]));

    const variantTotals = new Map();
    const productTotals = new Map();
    for (const n of needList) {
        const target = n.variantId ? variantTotals : productTotals;
        const id = n.variantId ?? n.productId;
        target.set(id, (target.get(id) ?? 0) + n.qty);
    }

    const [res] = await tx.$queryRaw`
        WITH
        mov AS (
            INSERT INTO stock_movements
                (id, store_id, outlet_id, type, order_id, reference_number, performed_by_id,
                 total_quantity, total_cost, total_products)
            SELECT m.id, ${storeId}::text, m.outlet_id, 'STOCK_OUT', ${orderId}::text, ${`#${orderNumber}`}::text, ${userId}::text,
                   m.qty, m.cost, m.products
            FROM unnest(
                ${movements.map((m) => m.id)}::text[],
                ${movements.map((m) => m.outletId)}::text[],
                ${movements.map((m) => m.qty)}::int[],
                ${movements.map((m) => m.cost)}::numeric[],
                ${movements.map((m) => m.products)}::int[]
            ) AS m(id, outlet_id, qty, cost, products)
            RETURNING id
        ),
        mov_items AS (
            INSERT INTO stock_movement_items
                (id, movement_id, store_id, outlet_id, type, batch_id, product_id, variant_id,
                 product_name, variant_name, sku, quantity, unit_cost)
            SELECT i.id, i.movement_id, ${storeId}::text, i.outlet_id, 'STOCK_OUT', i.batch_id,
                   i.product_id, i.variant_id,
                   sb.product_name, sb.variant_name, sb.sku,
                   i.qty, i.unit_cost
            FROM unnest(
                ${picks.map(() => randomUUID())}::text[],
                ${picks.map((p) => movementIdByOutlet.get(p.outletId))}::text[],
                ${picks.map((p) => p.outletId)}::text[],
                ${picks.map((p) => p.batchId)}::text[],
                ${picks.map((p) => p.productId)}::text[],
                ${picks.map((p) => p.variantId ?? null)}::text[],
                ${picks.map((p) => p.quantity)}::int[],
                ${picks.map((p) => String(p.unitCost))}::numeric[]
            ) AS i(id, movement_id, outlet_id, batch_id, product_id, variant_id, qty, unit_cost)
            JOIN stock_batches sb ON sb.id = i.batch_id AND sb.store_id = ${storeId}
            RETURNING id
        ),
        upd_batches AS (
            UPDATE stock_batches b
            SET remaining_quantity = b.remaining_quantity - t.qty, updated_at = now()
            FROM unnest(${picks.map((p) => p.batchId)}::text[], ${picks.map((p) => p.quantity)}::int[]) AS t(id, qty)
            WHERE b.id = t.id AND b.store_id = ${storeId}
            RETURNING b.id
        ),
        upd_stock AS (
            UPDATE outlet_stocks os
            SET quantity = os.quantity - s.qty, last_sold_at = now(), updated_at = now()
            FROM unnest(${needList.map((n) => n.outletId)}::text[], ${needList.map((n) => n.itemKey)}::text[], ${needList.map((n) => n.qty)}::int[])
                 AS s(outlet_id, item_key, qty)
            WHERE os.store_id = ${storeId} AND os.outlet_id = s.outlet_id AND os.item_key = s.item_key
            RETURNING os.id
        ),
        upd_variants AS (
            UPDATE product_variants v
            SET quantity = v.quantity - a.qty, updated_at = now()
            FROM unnest(${[...variantTotals.keys()]}::text[], ${[...variantTotals.values()]}::int[]) AS a(id, qty)
            WHERE v.id = a.id AND v.store_id = ${storeId}
            RETURNING v.id
        ),
        upd_products AS (
            UPDATE products p
            SET quantity = p.quantity - a.qty, updated_at = now()
            FROM unnest(${[...productTotals.keys()]}::text[], ${[...productTotals.values()]}::int[]) AS a(id, qty)
            WHERE p.id = a.id AND p.store_id = ${storeId}
            RETURNING p.id
        )
        SELECT (SELECT count(*) FROM mov)::int          AS movements,
               (SELECT count(*) FROM mov_items)::int    AS items,
               (SELECT count(*) FROM upd_batches)::int  AS batches,
               (SELECT count(*) FROM upd_stock)::int    AS stock,
               (SELECT count(*) FROM upd_variants)::int AS variants,
               (SELECT count(*) FROM upd_products)::int AS products
    `;

    if (res.movements !== movements.length || res.items !== picks.length
        || res.batches !== picks.length || res.stock !== needList.length
        || res.variants !== variantTotals.size || res.products !== productTotals.size) {
        throw Object.assign(new Error("Stock rows out of sync"), { code: "STOCK_OUT_OF_SYNC" });
    }
};

// 7. Increment customer totalOrder non-blocking counter outside transaction
const incrementCustomerOrderCount = (storeId, customerId) => {
    prisma.customer
        .update({
            where: { id: customerId, storeId },
            data: { totalOrder: { increment: 1 } },
            select: { id: true },
        })
        .catch((err) => logger.warn({ err, customerId, storeId }, "customer totalOrder increment failed"));
};

// ==================================== CREATE ORDER MODEL ====================================

export const createOrderModel = async (
    storeId,
    userId,
    { order, customerId, lines, outletIds, preferredOutletId, payment, makeActivity }
) => {
    const t0 = performance.now();
    const lap = (label) => {
        if (process.env.ORDER_TIMING === "1") {
            logger.info({ label, ms: Math.round(performance.now() - t0) }, "createOrder timing");
        }
    };

    const result = await prisma.$transaction(
        async (tx) => {
            lap("tx started");

            // 1. Order number. Locks the store row until commit.
            const orderNumber = await allocateNextOrderNumber(tx, storeId);
            lap("store");

            // 2. Lock outlet stock availability
            const itemKeys = [...new Set(lines.map((l) => l.itemKey))];
            const availability = await lockAndGetOutletStock(tx, storeId, outletIds, itemKeys);
            lap("stock lock");

            // 3. Allocate lines across outlets
            const { rows, needList } = planStockAllocation({ lines, availability, outletIds, preferredOutletId });

            // 4. Lock batches & FEFO pick
            const picks = await lockAndPickBatches(tx, storeId, needList);
            lap("batch lock");

            // 5. Insert order, items, activity, and payment
            const { created, fulfilledFrom } = await insertOrderWithItemsAndActivity(tx, {
                storeId,
                userId,
                orderNumber,
                customerId,
                order,
                rows,
                payment,
                makeActivity,
            });
            lap("order create");

            // 6. Record stock movements and execute atomic updates in CTE
            await applyOrderStockDeductions(tx, {
                storeId,
                userId,
                orderId: created.id,
                orderNumber,
                picks,
                needList,
            });
            lap("big cte");

            return { order: created, fulfilledFrom };
        },
        { timeout: 20000, maxWait: 10000 }
    );

    lap("committed");

    // 7. Non-critical: customer counter incremented in background
    incrementCustomerOrderCount(storeId, customerId);

    return result;
};

// -----------------LIST ORDERS-----------------

// "1042", "1042", "9841", "sita": one search box for name, phone and order number
const searchWhere = (search) => {
    const term = search.replace(/^#/, "").trim();
    const or = [
        { customerName: { contains: term, mode: "insensitive" } },
        { customerPhone: { startsWith: term } },
    ];
    if (/^\d{1,9}$/.test(term)) or.push({ orderNumber: Number(term) }); // exact match, fits an Int
    return { OR: or };
};

export const getOrdersModel = async (storeId, { page, limit, search, status, channel, from, to }) => {
    const where = {
        storeId,
        ...(status && { status }),
        ...(CHANNEL_FILTER[channel] && { channel: CHANNEL_FILTER[channel] }),
        ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
        ...(search && searchWhere(search)),
    };

    const [items, total] = await Promise.all([
        prisma.order.findMany({
            where,
            select: listSelect,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }], // id keeps pages stable when times tie
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.order.count({ where }),
    ]);

    // Total quantity per order, for the orders on this page only (one grouped query, uses the orderId index)
    const sums = items.length
        ? await prisma.orderItem.groupBy({
            by: ["orderId"],
            where: { orderId: { in: items.map((o) => o.id) } },
            _sum: { quantity: true },
        })
        : [];

    return { items, total, quantities: new Map(sums.map((s) => [s.orderId, s._sum.quantity ?? 0])) };
};

const detailSelect = {
    id: true, orderNumber: true, channel: true, status: true,
    paymentStatus: true, paymentMethod: true,
    createdAt: true, updatedAt: true,
    createdBy: { select: { id: true, fullName: true } }, // null for website orders

    // customer details as they were when the order was placed
    customerName: true, customerPhone: true, customerEmail: true,
    province: true, district: true, city: true, address: true, landmark: true,
    customerNote: true, orderNote: true,
    customer: { select: { id: true, totalOrder: true, createdAt: true } }, // the linked profile

    // money
    subtotal: true, discount: true, deliveryFee: true, total: true,
    orderDiscountType: true, orderDiscountValue: true, orderDiscountAmount: true,
    couponCode: true, couponDiscount: true,
    paidAmount: true, refundedAmount: true,

    outlet: { select: { id: true, name: true } }, // where the order was placed

    items: {
        orderBy: { id: "asc" },
        select: {
            id: true, productId: true, variantId: true,
            productName: true, variantName: true, sku: true, image: true,
            unitPrice: true, quantity: true,
            discountType: true, discountValue: true, discountAmount: true, couponDiscountAmount: true,
            lineTotal: true,
            outlet: { select: { id: true, name: true } }, // the outlet that packs this line
        },
    },

    stockMovements: {
        orderBy: { createdAt: "desc" },
        select: {
            id: true, type: true, referenceNumber: true, createdAt: true,
            totalQuantity: true, totalCost: true, totalProducts: true,
            outlet: { select: { id: true, name: true } },
            performedBy: { select: { id: true, fullName: true } },
            items: {
                select: {
                    id: true, quantity: true, unitCost: true,
                    productId: true, variantId: true,
                    productName: true, variantName: true, sku: true,
                    batch: { select: { id: true, batchNumber: true, expiryDate: true } },
                },
            },
        },
    },

    activities: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], // newest first
        select: {
            id: true, action: true, title: true, meta: true, createdAt: true,
            actorType: true, actorId: true, actorName: true, actorRole: true,
        },
    },
};

// storeId is part of the where clause, so another store's order is simply "not found"
export const getOrderByIdModel = (storeId, orderId) =>
    prisma.order.findUnique({ where: { id: orderId, storeId }, select: detailSelect });

