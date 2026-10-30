import { randomUUID } from "node:crypto";
import { toCents, fromCents } from "../../utils/money.js"; 

export const buildSnapshot = (product, variant) => ({
    productName: product.name,
    variantName: variant?.name ?? null,
    sku: variant ? variant.sku ?? null : product.sku ?? null,
    meta: {
        image: variant?.imageUrls?.[0] ?? product.imageUrls?.[0] ?? null,
        sellingPrice: Number(variant?.sellingPrice ?? product.sellingPrice ?? 0),
        crossedPrice: Number(variant?.crossedPrice ?? product.crossedPrice ?? 0),
    },
});


/**
 * Atomically allocates `count` consecutive batch numbers in a single DB round-trip.
 * Returns the first number in the allocated range.
 */
const allocateBatchNumbers = async (tx, storeId, count) => {
    const updated = await tx.store.update({
        where: { id: storeId },
        data: { nextBatchNumber: { increment: count } },
        select: { nextBatchNumber: true },
    });
    // nextBatchNumber is the value AFTER the increment
    return updated.nextBatchNumber - count;
};

// Opening stock. Only items with quantity > 0 get an OutletStock row, a batch and a movement line.
//   - no variants passed -> the base product is the item
//   - variants passed    -> each variant is an item
// Must run inside the caller's transaction, AFTER the product / variants exist.
export const createInitialInventory = async (tx, { userId = null, storeId, outlet, product, variants = [] }) => {
    // 1. only items that really have units
    const stocked = (variants.length > 0 ? variants : [null])
        .map((variant) => {
            const source = variant ?? product; // quantity and costPrice live on whichever one is the item
            return {
                variant,
                quantity: source.quantity ?? 0,
                unitCostCents: toCents(source.costPrice),
            };
        })
        .filter((it) => it.quantity > 0);

    if (stocked.length === 0) return;

    const now = new Date();
    const totalQuantity = stocked.reduce((s, it) => s + it.quantity, 0);
    const totalCostCents = stocked.reduce((s, it) => s + it.unitCostCents * it.quantity, 0);

    // 2. movement header (batches point to it)
    const movement = await tx.stockMovement.create({
        data: {
            storeId,
            outletId: outlet.id,
            type: "STOCK_IN",
            note: "Initial stock when product was created",
            performedById: userId,
            totalQuantity,
            totalCost: fromCents(totalCostCents),
            totalProducts: stocked.length,
        },
        select: { id: true },
    });

    // 3. reserve all batch numbers at once
    const firstBatchNumber = await allocateBatchNumbers(tx, storeId, stocked.length);

    // ids are made here so the lines can point at the batches without reading them back
    const rows = stocked.map((it, i) => ({
        ...it,
        batchId: randomUUID(),
        batchNumber: firstBatchNumber + i,
        snapshot: buildSnapshot(product, it.variant),
    }));

    // 4. batches first, then the lines and live stock (independent of each other)
    await tx.stockBatch.createMany({
        data: rows.map((r) => ({
            id: r.batchId,
            storeId,
            batchNumber: r.batchNumber,
            movementId: movement.id,
            outletId: outlet.id,
            productId: product.id,
            variantId: r.variant?.id ?? null,
            ...r.snapshot, // productName, variantName, sku, meta
            unitCost: fromCents(r.unitCostCents),
            quantity: r.quantity,
            remainingQuantity: r.quantity,
        })),
    });

    await Promise.all([
        tx.stockMovementItem.createMany({
            data: rows.map((r) => ({
                movementId: movement.id,
                storeId,
                outletId: outlet.id,
                type: "STOCK_IN",
                batchId: r.batchId,
                productId: product.id,
                variantId: r.variant?.id ?? null,
                productName: r.snapshot.productName,
                variantName: r.snapshot.variantName,
                sku: r.snapshot.sku,
                quantity: r.quantity,
                unitCost: fromCents(r.unitCostCents),
            })),
        }),
        tx.outletStock.createMany({
            data: rows.map((r) => ({
                storeId,
                outletId: outlet.id,
                productId: product.id,
                variantId: r.variant?.id ?? null,
                itemKey: r.variant?.id ?? product.id,
                quantity: r.quantity,
                expiredQuantity: 0,
                lastStockedAt: now,
            })),
        }),
    ]);
};



// Writes off all remaining units, deletes the live stock rows, then deletes the variants.
// variantIds = null means the base product.
export const removeStock = async (tx, { storeId, productId, variantIds, userId, note }) => {
    const variantFilter = all
        ? {}                                         // base product + every variant
        : variantIds
            ? { variantId: { in: variantIds } }
            : { variantId: null };                   // base product only

    const batches = await tx.stockBatch.findMany({
        where: { storeId, productId, ...variantFilter, remainingQuantity: { gt: 0 } },
    });

    // one WRITE_OFF movement per outlet
    const byOutlet = new Map();
    for (const b of batches) {
        if (!byOutlet.has(b.outletId)) byOutlet.set(b.outletId, []);
        byOutlet.get(b.outletId).push(b);
    }

    for (const [outletId, list] of byOutlet) {
        const totalQuantity = list.reduce((s, b) => s + b.remainingQuantity, 0);
        const totalCostCents = list.reduce((s, b) => s + Math.round(Number(b.unitCost) * 100) * b.remainingQuantity, 0);

        await tx.stockMovement.create({
            data: {
                storeId, outletId, type: "WRITE_OFF", note,
                performedById: userId,
                totalQuantity,
                totalCost: (totalCostCents / 100).toFixed(2),
                totalProducts: new Set(list.map((b) => b.variantId ?? b.productId)).size,
                items: {
                    create: list.map((b) => ({
                        storeId, outletId, type: "WRITE_OFF",
                        batchId: b.id,
                        productId: b.productId,
                        variantId: b.variantId,
                        productName: b.productName,
                        variantName: b.variantName,
                        sku: b.sku,
                        quantity: b.remainingQuantity,
                        unitCost: b.unitCost,
                    })),
                },
            },
        });
    }

    if (batches.length > 0) {
        await tx.stockBatch.updateMany({
            where: { id: { in: batches.map((b) => b.id) } },
            data: { remainingQuantity: 0 },
        });
    }

    await tx.outletStock.deleteMany({ where: { storeId, productId, ...variantFilter } });

    if (variantIds) {
        await tx.productVariant.deleteMany({ where: { id: { in: variantIds }, productId, storeId } });
    }
};