import crypto from "node:crypto";
import prisma from "../../config/dbConfig.js";

export class StockConflictError extends Error {
    constructor({ productName, size, available }) {
        super(`Only ${available} left of ${productName} (${size})`);
        this.name = "StockConflictError";
        this.available = available;
    }
}

const pad = (value) => String(value).padStart(2, "0");

const generateOrderNumber = () => {
    const now = new Date();
    const stamp = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
    return `YNZ-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

export { generateOrderNumber };

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export const resolveCheckoutItems = async (items) => {
    if (!items || items.length === 0) return [];

    const variants = await prisma.productVariant.findMany({
        where: {
            OR: items.map((item) => ({
                productId: item.productId,
                size: item.size,
            })),
        },
        select: {
            id: true,
            size: true,
            stock: true,
            productId: true,
            product: {
                select: {
                    id: true,
                    shopId: true,
                    name: true,
                    image: true,
                    status: true,
                    price: true,
                    discountPrice: true,
                    shop: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        },
    });

    return variants.map((v) => ({
        productId: v.product.id,
        shopId: v.product.shopId,
        shopName: v.product.shop.name,
        productName: v.product.name,
        image: v.product.image,
        productStatus: v.product.status,
        price: v.product.price ? v.product.price.toString() : null,
        discountPrice: v.product.discountPrice ? v.product.discountPrice.toString() : null,
        variantId: v.id,
        size: v.size,
        stock: v.stock,
    }));
};

export const createCheckout = async ({ customerId, groups, checkoutId, paymentMethod, address, shippingFee }) => {
    const orderRows = [];
    const itemRows = [];
    const historyRows = [];

    for (const group of groups) {
        const subtotal = round2(group.items.reduce(
            (sum, item) => sum + item.unitPrice * item.quantity,
            0
        ));
        const orderShipping = round2(shippingFee * group.subtotalShare);
        const orderId = crypto.randomUUID();

        orderRows.push({
            id: orderId,
            orderNumber: generateOrderNumber(),
            checkoutId,
            customerId,
            shopId: group.shopId,
            status: "PENDING",

            subtotal,
            shippingFee: orderShipping,
            discount: 0,
            total: round2(subtotal + orderShipping),

            paymentMethod,
            paymentStatus: "PENDING",

            recipientName: address.recipientName,
            recipientPhone: address.recipientPhone,
            province: address.province ?? null,
            district: address.district ?? null,
            city: address.city ?? null,
            address: address.address,
            customerNote: address.note ?? null,
        });

        historyRows.push({
            id: crypto.randomUUID(),
            orderId,
            status: "PENDING",
            note: "Order placed",
            changedBy: customerId,
        });

        for (const item of group.items) {
            itemRows.push({
                id: crypto.randomUUID(),
                orderId,
                productId: item.productId,
                variantId: item.variantId,
                productName: item.productName,
                image: item.image,
                size: item.size,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                lineTotal: round2(item.unitPrice * item.quantity),
            });
        }
    }

    return await prisma.$transaction(async (tx) => {
        for (const group of groups) {
            for (const item of group.items) {
                const variant = await tx.productVariant.findUnique({
                    where: { id: item.variantId },
                    select: { id: true, stock: true },
                });

                if (!variant || variant.stock < item.quantity) {
                    throw new StockConflictError({
                        productName: item.productName,
                        size: item.size,
                        available: variant ? variant.stock : 0,
                    });
                }

                await tx.productVariant.update({
                    where: { id: item.variantId },
                    data: {
                        stock: { decrement: item.quantity },
                    },
                });
            }
        }

        await tx.order.createMany({ data: orderRows });
        await tx.orderItem.createMany({ data: itemRows });
        await tx.orderStatusHistory.createMany({ data: historyRows });

        return orderRows.map((row) => ({
            id: row.id,
            orderNumber: row.orderNumber,
            checkoutId: row.checkoutId,
            shopId: row.shopId,
            subtotal: row.subtotal,
            shippingFee: row.shippingFee,
            total: row.total,
        }));
    }, { timeout: 20000 });
};

export const getOrderById = async (orderId) => {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            items: {
                orderBy: { productName: "asc" },
            },
            history: {
                orderBy: { createdAt: "asc" },
            },
        },
    });

    if (!order) return null;

    return {
        ...order,
        subtotal: order.subtotal ? order.subtotal.toString() : "0",
        shippingFee: order.shippingFee ? order.shippingFee.toString() : "0",
        discount: order.discount ? order.discount.toString() : "0",
        total: order.total ? order.total.toString() : "0",
        items: (order.items ?? []).map((item) => ({
            ...item,
            unitPrice: item.unitPrice ? item.unitPrice.toString() : "0",
            lineTotal: item.lineTotal ? item.lineTotal.toString() : "0",
        })),
        history: order.history ?? [],
    };
};

export const listOrders = async ({ scope, ownerId, page, limit, status, search }) => {
    const where = {
        [scope === "shop" ? "shopId" : "customerId"]: ownerId,
        ...(status ? { status } : {}),
        ...(search ? { orderNumber: { contains: search, mode: "insensitive" } } : {}),
    };

    const [orders, total] = await Promise.all([
        prisma.order.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                shop: {
                    select: { name: true },
                },
                items: {
                    orderBy: { productName: "asc" },
                },
            },
        }),
        prisma.order.count({ where }),
    ]);

    const formattedOrders = orders.map((order) => {
        const { shop, ...rest } = order;
        return {
            ...rest,
            shopName: shop ? shop.name : null,
            subtotal: order.subtotal ? order.subtotal.toString() : "0",
            shippingFee: order.shippingFee ? order.shippingFee.toString() : "0",
            discount: order.discount ? order.discount.toString() : "0",
            total: order.total ? order.total.toString() : "0",
            items: (order.items ?? []).map((item) => ({
                ...item,
                unitPrice: item.unitPrice ? item.unitPrice.toString() : "0",
                lineTotal: item.lineTotal ? item.lineTotal.toString() : "0",
            })),
        };
    });

    return { orders: formattedOrders, total };
};

export const getOrderForShopUpdate = async (shopId, orderId) => {
    return await prisma.order.findFirst({
        where: { id: orderId, shopId },
        select: {
            id: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            items: {
                select: { variantId: true, quantity: true },
            },
        },
    });
};

export const applyStatusChange = async ({
    orderId,
    currentStatus,
    nextStatus,
    declineReason,
    note,
    changedBy,
    courierName,
    trackingNumber,
    restock,
    paymentStatus,
}) => {
    const now = new Date();

    const timestamps = {
        ACCEPTED: { acceptedAt: now },
        READY: { readyAt: now },
        DISPATCHED: { dispatchedAt: now },
        DELIVERED: { deliveredAt: now },
    }[nextStatus] ?? {};

    const restockable = restock?.filter((item) => item.variantId) ?? [];

    return await prisma.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
            where: { id: orderId, status: currentStatus },
            data: {
                status: nextStatus,
                paymentStatus,
                ...(nextStatus === "DECLINED" ? { declineReason: declineReason ?? null } : {}),
                ...(courierName !== undefined ? { courierName: courierName ?? null } : {}),
                ...(trackingNumber !== undefined ? { trackingNumber: trackingNumber ?? null } : {}),
                ...timestamps,
            },
        });

        if (updated.count === 0) return null;

        await tx.orderStatusHistory.create({
            data: {
                orderId,
                status: nextStatus,
                note: note ?? null,
                changedBy: changedBy ?? null,
            },
        });

        if (restockable.length > 0) {
            for (const item of restockable) {
                await tx.productVariant.update({
                    where: { id: item.variantId },
                    data: {
                        stock: { increment: item.quantity },
                    },
                });
            }
        }

        return { id: orderId, status: nextStatus, paymentStatus };
    }, { timeout: 20000 });
};

