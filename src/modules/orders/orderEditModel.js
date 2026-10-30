import prisma from "../../config/dbConfig.js";
import { fromCents } from "../../utils/money.js";
import { allocateStock, splitLines } from "./orderAllocation.js";
import { lockAvailability, lockBatches, pickBatches, recordMovements, applyStock ,keepLiveRestores} from "./orderHelpers/orderStockHelper.js";

// ---------- reads ----------
export const getOrderForEditModel = (storeId, orderId) =>
    prisma.order.findUnique({
        where: { id: orderId, storeId },
        select: {
            id: true, orderNumber: true, channel: true, status: true, outletId: true, updatedAt: true,
            paymentMethod: true, paymentStatus: true, paidAmount: true, refundedAmount: true,
            subtotal: true, discount: true, deliveryFee: true, total: true,
            orderDiscountType: true, orderDiscountValue: true, couponDiscount: true,
            items: {
                select: {
                    id: true, productId: true, variantId: true, outletId: true,
                    productName: true, variantName: true, sku: true, image: true,
                    unitPrice: true, quantity: true, discountType: true, discountValue: true, discountAmount: true,
                },
            },
        },
    });

export const getOrderForCustomerEditModel = (storeId, orderId) =>
    prisma.order.findUnique({
        where: { id: orderId, storeId },
        select: {
            id: true, orderNumber: true, status: true, updatedAt: true, customerId: true,
            customerName: true, customerPhone: true, customerEmail: true,
            province: true, district: true, city: true, address: true, landmark: true, customerNote: true,
        },
    });

export const getActiveOutletIdsModel = async (storeId) =>
    (await prisma.outlet.findMany({ where: { storeId, isActive: true }, select: { id: true } })).map((o) => o.id);

export const getProductsForOrderModel = (storeId, productIds, variantIds) =>
    prisma.product.findMany({
        where: { storeId, id: { in: productIds } },
        select: {
            id: true, name: true, sku: true, status: true, isAvailable: true, channel: true,
            hasVariants: true, sellingPrice: true, imageUrls: true,
            variants: { where: { id: { in: variantIds } }, select: { id: true, name: true, sku: true, sellingPrice: true } },
        },
    });

export const findCustomerByPhoneModel = (storeId, phone) =>
    prisma.customer.findUnique({
        where: { storeId_phone: { storeId, phone } },
        select: { id: true, name: true, email: true },
    });

// Units this order still holds per batch (taken minus already put back), latest taken first
export const getOrderNetPicksModel = (storeId, orderId) =>
    prisma.$queryRaw`
        SELECT mi.batch_id AS "batchId", mi.outlet_id AS "outletId",
               COALESCE(mi.variant_id, mi.product_id) AS "itemKey",
               mi.product_id AS "productId", mi.variant_id AS "variantId",
               SUM(CASE WHEN mi.type = 'STOCK_OUT' THEN mi.quantity ELSE -mi.quantity END)::int AS net,
               b.unit_cost::text AS "unitCost",
               (b.expiry_date IS NULL OR b.expiry_date >= (now() AT TIME ZONE 'Asia/Kathmandu')::date) AS sellable
        FROM stock_movement_items mi
        JOIN stock_movements m ON m.id = mi.movement_id
        JOIN stock_batches b ON b.id = mi.batch_id
        WHERE m.order_id = ${orderId} AND m.store_id = ${storeId}
          AND mi.type IN ('STOCK_OUT', 'STOCK_RESTORE')
        GROUP BY mi.batch_id, mi.outlet_id, mi.variant_id, mi.product_id, b.unit_cost, b.expiry_date
        HAVING SUM(CASE WHEN mi.type = 'STOCK_OUT' THEN mi.quantity ELSE -mi.quantity END) > 0
        ORDER BY MAX(mi.created_at) DESC, mi.batch_id
    `;

// ---------- guard ----------
// LOCK ORDER everywhere: 1. the order row  2. the store row (create only)  3. outlet_stocks sorted
//                        4. batches sorted. The updated_at check rejects a stale edit.
const guardOrder = async (tx, storeId, orderId, expectedUpdatedAt) => {
    const [row] = await tx.$queryRaw`
        SELECT updated_at AS "updatedAt" FROM orders WHERE id = ${orderId} AND store_id = ${storeId} FOR UPDATE
    `;
    if (!row) throw Object.assign(new Error("Order not found"), { code: "P2025" });
    if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw Object.assign(new Error("Order changed"), { code: "ORDER_CHANGED" });
    }
};

// ==================================== UPDATE ORDER SUMMARY HELPERS ====================================

// 1. Allocate additional stock required by items being added or quantities increased
const allocateAdditionalStock = async (tx, storeId, p) => {
    const takePlans = p.plans.filter((x) => x.delta > 0);
    if (!takePlans.length && !p.restores.length) {
        return { takePlans: [], assignments: [] };
    }

    const takeLines = takePlans.map((x, i) => ({
        index: i,
        itemKey: x.itemKey,
        quantity: x.delta,
        preferredOutletId: x.current[0]?.outletId,
    }));

    const itemKeys = [...new Set([...takeLines.map((l) => l.itemKey), ...p.restores.map((r) => r.itemKey)])];
    const lockOutlets = [...new Set([...p.outletIds, ...p.restores.map((r) => r.outletId)])];
    const availability = itemKeys.length ? await lockAvailability(tx, storeId, lockOutlets, itemKeys) : new Map();

    const { assignments, shortages } = allocateStock({
        lines: takeLines,
        availability,
        outletIds: p.outletIds,
        preferredOutletId: p.preferredOutletId,
    });

    if (shortages.length > 0) {
        throw Object.assign(new Error("Not enough stock"), {
            code: "STOCK_SHORT",
            shortages: shortages.map((s) => ({ ...s, displayName: takePlans[s.index].line.displayName })),
        });
    }

    return { takePlans, assignments };
};

// 2. Lock batches and allocate units (FEFO) for added stock, lock restore batches
const pickAndLockBatches = async (tx, storeId, { takePlans, assignments, restores }) => {
    const needs = new Map();
    for (const a of assignments) {
        const plan = takePlans[a.index];
        const k = `${a.outletId}|${plan.itemKey}`;
        const n = needs.get(k) ?? {
            outletId: a.outletId,
            itemKey: plan.itemKey,
            productId: plan.line.productId,
            variantId: plan.line.variantId,
            qty: 0,
        };
        n.qty += a.quantity;
        needs.set(k, n);
    }

    const takePicks = needs.size ? await pickBatches(tx, storeId, [...needs.values()]) : [];
    await lockBatches(tx, storeId, restores.map((r) => r.batchId));
    return takePicks;
};

// 3. Compute final assignments and split rows for modified items
const buildUpdatedOrderRows = ({ plans, takePlans, assignments }) => {
    const rowPlans = plans.filter((x) => x.kind !== "remove");
    const lines = rowPlans.map((x, i) => ({ ...x.line, index: i }));

    const finalAssignments = rowPlans.flatMap((x, i) => {
        const t = takePlans.indexOf(x);
        const rows = new Map();
        for (const r of x.remaining ?? x.current) {
            if (r.quantity > 0) rows.set(r.outletId, (rows.get(r.outletId) ?? 0) + r.quantity);
        }
        if (t >= 0) {
            for (const a of assignments) {
                if (a.index === t) rows.set(a.outletId, (rows.get(a.outletId) ?? 0) + a.quantity);
            }
        }
        const list = [...rows].map(([outletId, quantity]) => ({ index: i, outletId, quantity }));
        if (list.reduce((s, a) => s + a.quantity, 0) !== x.line.quantity) {
            throw Object.assign(new Error("Quantities out of sync"), { code: "STOCK_OUT_OF_SYNC" });
        }
        return list;
    });

    return splitLines(lines, finalAssignments);
};

// 4. Atomically replace changed order item rows in the database
const replaceOrderItems = async (tx, { orderId, plans, newRows }) => {
    const oldRowIds = plans.flatMap((x) => x.current.map((r) => r.id));
    if (oldRowIds.length) {
        await tx.orderItem.deleteMany({ where: { id: { in: oldRowIds }, orderId } });
    }
    if (newRows.length) {
        await tx.orderItem.createMany({
            data: newRows.map((r) => ({
                orderId,
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
        });
    }
};

// 5. Update order money, payment entries, and activity timeline
const updateOrderFinancialsAndActivities = async (tx, { storeId, orderId, order, payments, activities }) => {
    await tx.order.update({
        where: { id: orderId, storeId },
        data: {
            ...order,
            ...(payments?.length && {
                payments: {
                    create: payments,
                },
            }),
            activities: { create: activities },
        },
        select: { id: true },
    });
};

// 6. Record stock movements and adjust outlet stock quantities
const syncStockMovementsAndLevels = async (tx, { storeId, userId, orderId, orderNumber, takePicks, restores }) => {
    const liveRestores = await keepLiveRestores(tx, storeId, restores);

    const changes = [
        ...takePicks.map((x) => ({ ...x, type: "STOCK_OUT", sign: -1 })),
        ...liveRestores.map((x) => ({ ...x, type: "STOCK_RESTORE", sign: +1 })),
    ];
    if (changes.length === 0) return;

    const ctx = { storeId, userId, orderId, orderNumber, note: "Order edited" };
    await recordMovements(tx, { ...ctx, picks: changes });
    await applyStock(tx, storeId, changes);
};

// ---------- 1. summary ----------
// p.plans: what changes per item. p.restores: batches that get units back. p.order: money and payment patch.
export const updateOrderSummaryModel = (storeId, userId, p) =>
    prisma.$transaction(
        async (tx) => {
            // 1. Guard against stale / concurrent edits
            await guardOrder(tx, storeId, p.orderId, p.expectedUpdatedAt);

            // 2. Allocate additional stock if items are added or quantities increased
            const { takePlans, assignments } = await allocateAdditionalStock(tx, storeId, p);

            // 3. Lock & pick batches for added stock, lock restore batches
            const takePicks = await pickAndLockBatches(tx, storeId, {
                takePlans,
                assignments,
                restores: p.restores,
            });

            // 4. Build split rows for changed items
            const newRows = buildUpdatedOrderRows({
                plans: p.plans,
                takePlans,
                assignments,
            });

            // 5. Replace changed line item rows in the database
            await replaceOrderItems(tx, {
                orderId: p.orderId,
                plans: p.plans,
                newRows,
            });

            // 6. Update order totals, payments, and activities
            await updateOrderFinancialsAndActivities(tx, {
                storeId,
                orderId: p.orderId,
                order: p.order,
                payments: p.payments,
                activities: p.activities,
            });

            // 7. Record stock movements and adjust inventory levels
            await syncStockMovementsAndLevels(tx, {
                storeId,
                userId,
                orderId: p.orderId,
                orderNumber: p.orderNumber,
                takePicks,
                restores: p.restores,
            });
        },
        { timeout: 20000, maxWait: 10000 }
    );

// ==================================== UPDATE ORDER CUSTOMER HELPERS ====================================

// Lock customer rows in fixed order to prevent deadlocks and adjust total order counts
const reassignCustomerOrderCounts = async (tx, storeId, { decrementCustomerId, incrementCustomerId }) => {
    const ids = [decrementCustomerId, incrementCustomerId].filter(Boolean);
    if (!ids.length) return;

    await tx.$queryRaw`SELECT id FROM customers WHERE store_id = ${storeId} AND id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;

    if (decrementCustomerId) {
        await tx.customer.updateMany({
            where: { id: decrementCustomerId, storeId, totalOrder: { gt: 0 } },
            data: { totalOrder: { decrement: 1 } },
        });
    }
    if (incrementCustomerId) {
        await tx.customer.update({
            where: { id: incrementCustomerId, storeId },
            data: { totalOrder: { increment: 1 } },
            select: { id: true },
        });
    }
};

// ---------- 2. customer details ----------
export const updateOrderCustomerModel = (storeId, p) =>
    prisma.$transaction(async (tx) => {
        await guardOrder(tx, storeId, p.orderId, p.expectedUpdatedAt);

        await reassignCustomerOrderCounts(tx, storeId, {
            decrementCustomerId: p.decrementCustomerId,
            incrementCustomerId: p.incrementCustomerId,
        });

        await tx.order.update({
            where: { id: p.orderId, storeId },
            data: { ...p.patch, activities: { create: p.activities } },
            select: { id: true },
        });
    });



// ============================= UPDATE ORDER STATUS ======================================

export const getOrderForStatusModel = (storeId, orderId) =>
    prisma.order.findUnique({
        where: { id: orderId, storeId },
        select: {
            id: true, orderNumber: true, status: true, channel: true, updatedAt: true,
            paymentMethod: true, paymentStatus: true, total: true, paidAmount: true, refundedAmount: true,
        },
    });

// LOCK ORDER (same as everywhere): order row, then outlet_stocks sorted, then batches sorted.
// p.restores = picks with type "STOCK_RESTORE" and sign +1, one per batch
export const updateOrderStatusModel = (storeId, userId, p) =>
    prisma.$transaction(
        async (tx) => {
            await guardOrder(tx, storeId, p.orderId, p.expectedUpdatedAt);

            if (p.restores.length > 0) {
                await lockAvailability(
                    tx, storeId,
                    [...new Set(p.restores.map((r) => r.outletId))],
                    [...new Set(p.restores.map((r) => r.itemKey))]
                );
                await lockBatches(tx, storeId, p.restores.map((r) => r.batchId));
            }

            await tx.order.update({
                where: { id: p.orderId, storeId },
                data: {
                    ...p.patch,
                    ...(p.payments.length > 0 && { payments: { create: p.payments } }),
                    activities: { create: p.activities },
                },
                select: { id: true },
            });

            await recordMovements(tx, {
                storeId, userId, orderId: p.orderId, orderNumber: p.orderNumber, picks: p.restores, note: p.stockNote,
            });
            await applyStock(tx, storeId, p.restores);
        },
        { timeout: 20000, maxWait: 10000 }
    );


    // Restores for deleted products or variants are dropped. Used before the transaction, to count what is skipped.
export const getLiveRestoresModel = (storeId, restores) => keepLiveRestores(prisma, storeId, restores);