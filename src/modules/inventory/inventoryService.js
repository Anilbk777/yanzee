import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import { getStockInRefsModel, createStockInModel, getMovementsModel ,getStockModel,getItemBatchesModel  } from "./inventoryModel.js";
import { toCents, fromCents } from "../../utils/money.js"; 

const MAX_TOTAL_PRICE = 99_999_999_999_999; // Decimal(14,2) limit for the movement total

const fromCosts = (cost) => (cost / 100).toFixed(2); // exact: unit costs are validated to 2 decimals

// Today's date in Nepal as YYYY-MM-DD (ISO dates compare correctly as strings)
const todayInNepal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());

const bad = (i, message) => new AppError(`Item ${i + 1}: ${message}`, constants.BadRequest);

const batchLabel = (n) => `B-${String(n).padStart(6, "0")}`;

export const stockInService = async (storeId, userId, payload) => {
    const { outletId, referenceNumber, supplierName, note, items } = payload;
    logger.info({ storeId, outletId, items: items.length }, "Stock in started");

    const productIds = [...new Set(items.map((i) => i.productId))];
    const variantIds = [...new Set(items.map((i) => i.variantId).filter(Boolean))];

    const { outlet, products, variants } = await getStockInRefsModel(storeId, outletId, productIds, variantIds);

    if (!outlet) throw new AppError("Outlet not found", constants.NotFound);
    if (!outlet.isActive) throw new AppError("This outlet is turned off. Turn it on before adding stock", constants.Conflict);

    const productMap = new Map(products.map((p) => [p.id, p]));
    const variantMap = new Map(variants.map((v) => [v.id, v.productId]));
    const today = todayInNepal();

    let totalQuantity = 0;
    let totalCostValue = 0;

    const lines = items.map((item, i) => {
        const product = productMap.get(item.productId);
        if (!product) throw bad(i, "product not found");
        if (product.status === "ARCHIVED") throw bad(i, `"${product.name}" is archived`);

        if (product.hasVariants) {
            if (!item.variantId) throw bad(i, `choose a variant for "${product.name}"`);
            if (variantMap.get(item.variantId) !== item.productId) throw bad(i, "variant doesn't belong to this product");
        } else if (item.variantId) {
            throw bad(i, `"${product.name}" has no variants`);
        }

        if (item.expiryDate && item.expiryDate < today) throw bad(i, "expiry date is in the past");

        const unitCost = Math.round(item.unitCost * 100);
        totalQuantity += item.quantity;
        totalCostValue += unitCost * item.quantity;

        return {
            productId: item.productId,
            variantId: item.variantId ?? null,
            supplierLot: item.supplierLot ?? null,
            quantity: item.quantity,
            unitCost: fromCosts(unitCost),
            manufactureDate: item.manufactureDate ?? null,
            expiryDate: item.expiryDate ?? null,
        };
    });

    if (totalCostValue > MAX_TOTAL_PRICE) throw new AppError("The stock-in total is too large", constants.BadRequest);

    // "How many different items": the same item on two lines counts once
    const totalProducts = new Set(lines.map((l) => l.variantId ?? l.productId)).size;
    const totalCost = fromCosts(totalCostValue);

    let result;
    try {
        result = await createStockInModel(storeId, userId, {
            outletId, referenceNumber, supplierName, note,
            totalQuantity, totalCost, totalProducts, lines,
        });
    } catch (error) {
        const fkViolation = error?.code === "P2003" || (error?.code === "P2010" && error?.meta?.code === "23503");
        if (fkViolation || error?.code === "P2025") {
            throw new AppError("A product, variant or outlet changed while saving. Please retry", constants.Conflict);
        }
        throw error;
    }

    const { movement, batches } = result;
    logger.info({ storeId, movementId: movement.id, userId }, "Stock in completed");

    return {
        statusCode: 201,
        message: "Stock added successfully",
        data: {
            movement: {
                id: movement.id,
                type: "STOCK_IN",
                outletId, referenceNumber, supplierName, note,
                totalProducts, totalQuantity, totalCost,
                createdAt: movement.createdAt,
                batches: batches.map((b) => ({
                    id: b.id,
                    batchNumber: b.batchNumber,
                    batchLabel: batchLabel(b.batchNumber),
                    productId: b.productId,
                    variantId: b.variantId,
                    quantity: b.quantity,
                    unitCost: b.unitCost,
                    expiryDate: b.expiryDate,
                })),
            },
        },
    };
};



export const getMovementsService = async (storeId, query) => {
    const { items, total } = await getMovementsModel(storeId, query);

    return {
        statusCode: 200,
        message: "Stock movements fetched successfully",
        data: {
            movements: items.map(({ totalCost, otherOutlet, ...m }) => ({
                ...m,
                totalValue: totalCost, // quantity x unit cost
                otherOutlet: otherOutlet ?? null,
            })),
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        },
    };
};



const money = (n) => Math.round(Number(n) * 100) / 100;
const sum = (list, key) => list.reduce((total, o) => total + Number(o[key]), 0);

export const getStockService = async (storeId, query) => {
    const { items, total } = await getStockModel(storeId, query);

    const data = items.map((row) => {
        const outlets = row.outlets.map((o) => ({
            outletId: o.outletId,
            outletName: o.outletName,
            quantity: o.quantity,
            status: o.status,
            batchCount: o.batchCount,
            totalCost: money(o.totalCost),
        }));

        return {
            productId: row.productId,
            variantId: row.variantId,
            name: row.name,
            sku: row.sku,
            quantity: sum(outlets, "quantity"),
            // with an outlet filter, the item status is that outlet's status
            status: query.outletId ? outlets[0]?.status ?? "OUT_OF_STOCK" : row.status,
            batchCount: sum(outlets, "batchCount"),
            totalCost: money(sum(outlets, "totalCost")),
            outlets,
        };
    });

    return {
        statusCode: 200,
        message: "Stock fetched successfully",
        data: {
            items: data,
            pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
        },
    };
};


export const getItemBatchesService = async (storeId, productId, query) => {
    const rows = await getItemBatchesModel(storeId, productId, query);

    if (rows.length === 0) throw new AppError("Product not found", constants.NotFound);
    const head = rows[0];

    if (query.variantId && !head.hasVariants) {
        throw new AppError("This product has no variants", constants.BadRequest);
    }
    const units = rows.filter((r) => r.hasUnit);
    if (query.variantId && units.length === 0) throw new AppError("Variant not found", constants.NotFound);

    const variants = units.map((r) => ({
        variantId: r.variantId, // null for a product without variants
        variantName: r.variantName,
        name: r.variantName ? `${r.productName} — ${r.variantName}` : r.productName,
        summary: {
            batchCount: r.batchCount,
            totalReceived: r.received,
            totalRemaining: r.remaining,
            totalCost: r.cost, // received quantity x unit cost, summed
        },
        batches: r.batches.map((b) => ({
            id: b.id,
            batchNumber: b.batchNumber,
            batchLabel: batchLabel(b.batchNumber),
            outlet: { id: b.outletId, name: b.outletName },
            unitCost: b.unitCost,
            totalCost: b.totalCost,
            stock: {
                received: b.received,
                remaining: b.remaining,
                used: b.received - b.remaining, // sold, transferred, written off
            },
            expiryDate: b.expiryDate,
            createdAt: b.createdAt,
        })),
        pagination: {
            page: query.page,
            limit: query.limit,
            total: r.batchCount,
            totalPages: Math.ceil(r.batchCount / query.limit),
        },
    }));

    return {
        statusCode: 200,
        message: "Batches fetched successfully",
        data: {
            item: { productId: head.productId, productName: head.productName, hasVariants: head.hasVariants },
            summary: {
                variantCount: variants.length,
                batchCount: variants.reduce((s, v) => s + v.summary.batchCount, 0),
                totalReceived: variants.reduce((s, v) => s + v.summary.totalReceived, 0),
                totalRemaining: variants.reduce((s, v) => s + v.summary.totalRemaining, 0),
                totalCost: fromCents(variants.reduce((s, v) => s + toCents(v.summary.totalCost), 0)),
            },
            variants,
        },
    };
};