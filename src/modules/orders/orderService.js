import crypto from "node:crypto";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { CartModel } from "../cart/cartModel.js";
import {
    createCheckout,
    getOrderById,
    listOrders,
    getOrderForShopUpdate,
    applyStatusChange,
    StockConflictError,
} from "./orderModel.js";

// ONE ORDER = ONE SHOP. The shop owner's status tabs are the states, and the
// actions are the transitions out of them. DECLINED, DELIVERED and CANCELLED
// are terminal, so an empty list means "this order is finished".
const ALLOWED_TRANSITIONS = {
    PENDING: ["ACCEPTED", "DECLINED", "CANCELLED"],
    ACCEPTED: ["READY"],
    READY: ["DISPATCHED"],
    DISPATCHED: ["DELIVERED"],
    DECLINED: [],
    DELIVERED: [],
    CANCELLED: [],
};

// The customer can only cancel, and only before the shop has accepted.
// Everything else is the shop's action, so CANCELLED is withheld from the
// shop's action set even though the state is reachable from PENDING.
const SHOP_ACTIONS = ["ACCEPTED", "DECLINED", "READY", "DISPATCHED", "DELIVERED"];

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

// Raw SQL returns the decimals as text to keep the exact stored value; the
// client is shown money, so it is converted to numbers here.
const serializeOrder = (order) => {
    if (!order) return null;

    const { subtotal, total, shippingFee, discount, items, history, ...rest } = order;

    return {
        ...rest,
        subtotal: Number(subtotal),
        shippingFee: Number(shippingFee),
        discount: Number(discount),
        total: Number(total),
        items: (items ?? []).map((item) => ({
            ...item,
            unitPrice: Number(item.unitPrice),
            lineTotal: Number(item.lineTotal),
        })),
        ...(history ? { history } : {}),
    };
};

// -----------------------------------------------------------------------------
// CHECKOUT
// -----------------------------------------------------------------------------

const checkoutPreviewService = async (userId) => {
    logger.info({ userId }, "Fetching checkout preview");

    const cart = await CartModel.findOrCreateCart(userId);
    const selectedItems = await CartModel.findSelectedItems(cart.id);

    if (selectedItems.length === 0) {
        throw new AppError("No items selected in cart for checkout", constants.BadRequest);
    }

    const issues = [];
    const shopsMap = new Map();
    let grandSubtotal = 0;

    for (const item of selectedItems) {
        const product = item.variant.product;
        const shop = product.shop;
        const shopId = product.shopId;

        if (product.status !== "ACTIVE") {
            issues.push(`Product "${product.name}" is no longer active`);
        }

        if (item.variant.stock < item.quantity) {
            issues.push(
                `Only ${item.variant.stock} units available for "${product.name}" (${item.variant.size})`
            );
        }

        const listPrice = Number(product.price);
        const discountPrice = product.discountPrice ? Number(product.discountPrice) : null;
        const effectivePrice = discountPrice !== null && discountPrice > 0 ? discountPrice : listPrice;
        const lineTotal = round2(effectivePrice * item.quantity);

        grandSubtotal += lineTotal;

        if (!shopsMap.has(shopId)) {
            shopsMap.set(shopId, {
                shopId,
                shopName: shop ? shop.name : "Unknown Shop",
                items: [],
                subtotal: 0,
            });
        }

        const group = shopsMap.get(shopId);
        group.items.push({
            itemId: item.id,
            variantId: item.variantId,
            productId: product.id,
            productName: product.name,
            image: product.image,
            size: item.variant.size,
            unitPrice: effectivePrice.toFixed(2),
            quantity: item.quantity,
            lineTotal: lineTotal.toFixed(2),
        });
        group.subtotal = round2(group.subtotal + lineTotal);
    }

    const shippingFee = 0;
    const totalAmount = round2(grandSubtotal + shippingFee);

    const shops = Array.from(shopsMap.values()).map((s) => ({
        ...s,
        subtotal: s.subtotal.toFixed(2),
    }));

    return {
        statusCode: constants.Success || 200,
        message: "Checkout preview generated successfully",
        data: {
            canPlaceOrder: issues.length === 0,
            issues,
            itemCount: selectedItems.reduce((acc, i) => acc + i.quantity, 0),
            subtotal: round2(grandSubtotal).toFixed(2),
            shippingFee: shippingFee.toFixed(2),
            totalAmount: totalAmount.toFixed(2),
            shops,
        },
    };
};

const checkoutService = async (user, payload) => {
    const userId = typeof user === "object" ? user.id : user;
    logger.info({ userId, paymentMethod: payload.paymentMethod }, "Attempting checkout from cart");

    const cart = await CartModel.findOrCreateCart(userId);
    const selectedItems = await CartModel.findSelectedItems(cart.id);

    if (selectedItems.length === 0) {
        throw new AppError("No items selected in cart for checkout", constants.BadRequest);
    }

    const variantIdsToRemove = [];
    const processedItems = [];

    for (const item of selectedItems) {
        const product = item.variant.product;
        const shop = product.shop;

        if (product.status !== "ACTIVE") {
            throw new AppError(`"${product.name}" is not available for purchase`, constants.BadRequest);
        }

        if (product.shop.ownerId === userId) {
            throw new AppError("You cannot purchase products from your own shop", constants.BadRequest);
        }

        if (item.variant.stock < item.quantity) {
            throw new AppError(
                `Only ${item.variant.stock} left of ${product.name} (${item.variant.size})`,
                constants.Conflict
            );
        }

        const listPrice = Number(product.price);
        const discountPrice = product.discountPrice ? Number(product.discountPrice) : null;
        const effectivePrice = discountPrice !== null && discountPrice > 0 ? discountPrice : listPrice;

        variantIdsToRemove.push(item.variantId);
        processedItems.push({
            productId: product.id,
            variantId: item.variantId,
            shopId: product.shopId,
            shopName: shop ? shop.name : "Unknown Shop",
            productName: product.name,
            image: product.image,
            size: item.variant.size,
            unitPrice: effectivePrice,
            quantity: item.quantity,
        });
    }

    // Group items by shop
    const groupsByShop = new Map();
    for (const item of processedItems) {
        if (!groupsByShop.has(item.shopId)) {
            groupsByShop.set(item.shopId, { shopId: item.shopId, shopName: item.shopName, items: [] });
        }
        groupsByShop.get(item.shopId).items.push(item);
    }

    const groups = [...groupsByShop.values()];
    const grandSubtotal = processedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const shippingFee = 0;
    const totalAmount = round2(grandSubtotal + shippingFee);

    for (const group of groups) {
        const groupSubtotal = group.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
        group.subtotalShare = grandSubtotal > 0 ? groupSubtotal / grandSubtotal : 1 / groups.length;
    }

    const checkoutId = crypto.randomUUID();

    // Check payment gateway stubbing for digital payment methods
    if (payload.paymentMethod === "ESEWA" || payload.paymentMethod === "KHALTI") {
        return {
            statusCode: constants.Success || 200,
            message: `${payload.paymentMethod} gateway integration coming soon`,
            data: {
                checkoutId,
                paymentMethod: payload.paymentMethod,
                paymentStatus: "PENDING",
                status: "GATEWAY_STUBBED",
                totalAmount: totalAmount.toFixed(2),
            },
        };
    }

    let orders;
    try {
        orders = await createCheckout({
            customerId: userId,
            cartId: cart.id,
            groups,
            checkoutId,
            paymentMethod: payload.paymentMethod,
            address: payload.address,
            totalAmount,
            variantIdsToRemove,
            shippingFee,
        });
    } catch (error) {
        if (error instanceof StockConflictError) {
            throw new AppError(error.message, constants.Conflict);
        }
        throw error;
    }

    logger.info({ customerId: userId, checkoutId, orders: orders.length }, "Checkout completed");

    return {
        statusCode: constants.Created || 201,
        message:
            orders.length > 1
                ? `Checkout split into ${orders.length} orders across ${orders.length} shops`
                : "Order placed successfully",
        data: {
            checkoutId,
            orderCount: orders.length,
            orders: orders.map((order) => ({
                id: order.id,
                orderNumber: order.orderNumber,
                checkoutId: order.checkoutId,
                shopId: order.shopId,
                subtotal: Number(order.subtotal),
                shippingFee: Number(order.shippingFee),
                total: Number(order.total),
            })),
        },
    };
};

// -----------------------------------------------------------------------------
// CUSTOMER
// -----------------------------------------------------------------------------

const listMyOrdersService = async (customerId, query) => {
    const { page, limit, status, search } = query;
    const { orders, total } = await listOrders({ scope: "customer", ownerId: customerId, page, limit, status, search });

    return {
        statusCode: 200,
        message: "Orders fetched successfully",
        data: {
            orders: orders.map(serializeOrder),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1),
            },
        },
    };
};

const getMyOrderService = async (customerId, orderId) => {
    const order = await getOrderById(orderId);

    // Another customer's order is a 404, not a 403: the response must not
    // confirm that the id exists.
    if (!order || order.customerId !== customerId) {
        throw new AppError("Order not found", constants.NotFound);
    }

    return {
        statusCode: 200,
        message: "Order fetched successfully",
        data: { order: serializeOrder(order) },
    };
};

const cancelOrderService = async (customerId, orderId, payload) => {
    const order = await getOrderById(orderId);

    if (!order || order.customerId !== customerId) {
        throw new AppError("Order not found", constants.NotFound);
    }

    if (!ALLOWED_TRANSITIONS[order.status]?.includes("CANCELLED")) {        throw new AppError(
            `An order that is already ${order.status.toLowerCase().replace("_", " ")} cannot be cancelled`,
            constants.BadRequest
        );
    }

    // Restock, because the items never shipped.
    const updated = await applyStatusChange({
        orderId,
        currentStatus: order.status,
        nextStatus: "CANCELLED",
        note: payload.reason,
        changedBy: customerId,
        restock: order.items,
        paymentStatus: order.paymentStatus === "PAID" ? "REFUNDED" : order.paymentStatus,
    });

    if (!updated) {
        throw new AppError("Order was just updated, please try again", constants.Conflict);
    }

    logger.info({ orderId, customerId }, "Order cancelled by customer");

    return {
        statusCode: 200,
        message: "Order cancelled successfully",
        data: { id: orderId, status: "CANCELLED" },
    };
};

// -----------------------------------------------------------------------------
// SHOP OWNER
// -----------------------------------------------------------------------------

const listShopOrdersService = async (shop, query) => {
    const { page, limit, status, search } = query;
    const { orders, total } = await listOrders({ scope: "shop", ownerId: shop.id, page, limit, status, search });

    return {
        statusCode: 200,
        message: "Orders fetched successfully",
        data: {
            orders: orders.map(serializeOrder),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1),
            },
        },
    };
};

const getShopOrderService = async (shop, orderId) => {
    const order = await getOrderById(orderId);

    if (!order || order.shopId !== shop.id) {
        throw new AppError("Order not found", constants.NotFound);
    }

    return {
        statusCode: 200,
        message: "Order fetched successfully",
        data: { order: serializeOrder(order) },
    };
};

const updateOrderStatusService = async (shop, orderId, payload) => {
    logger.info({ orderId, shopId: shop.id, next: payload.status }, "Attempting order status change");

    // One read: authorises the shop and carries the item rows needed for a
    // possible restock.
    const order = await getOrderForShopUpdate(shop.id, orderId);

    if (!order) {
        throw new AppError("Order not found", constants.NotFound);
    }

    // CANCELLED is reachable from PENDING, but it is the customer's action.
    if (!SHOP_ACTIONS.includes(payload.status)) {
        throw new AppError("Only the customer can cancel an order", constants.Forbidden);
    }

    if (order.status === payload.status) {
        throw new AppError(`Order is already ${payload.status.toLowerCase().replace("_", " ")}`, constants.BadRequest);
    }

    if (!ALLOWED_TRANSITIONS[order.status]?.includes(payload.status)) {
        throw new AppError(
            `Cannot go from ${order.status} to ${payload.status}`,
            constants.BadRequest
        );
    }

    // Declining or cancelling returns the units to the shop's stock.
    const restock = ["DECLINED"].includes(payload.status) ? order.items : null;

    // Cash on delivery is settled at the doorstep, so it is only marked paid
    // once the order is delivered. ESEWA and KHALTI are left to the gateway
    // callback, which is not wired up yet, so they keep their current status.
    let paymentStatus = order.paymentStatus;
    if (payload.status === "DELIVERED" && order.paymentMethod === "COD") {
        paymentStatus = "PAID";
    } else if (payload.status === "DECLINED" && order.paymentStatus === "PAID") {
        paymentStatus = "REFUNDED";
    }

    const updated = await applyStatusChange({
        orderId,
        currentStatus: order.status,
        nextStatus: payload.status,
        declineReason: payload.declineReason,
        note: payload.note,
        changedBy: shop.ownerId ?? null,
        courierName: payload.courierName,
        trackingNumber: payload.trackingNumber,
        restock,
        paymentStatus,
    });

    if (!updated) {
        // The order moved out of `order.status` between the read and the
        // write, so someone else handled this action first.
        throw new AppError("Order was just updated, please try again", constants.Conflict);
    }

    logger.info({ orderId, next: payload.status }, "Order status changed");

    return {
        statusCode: 200,
        message: `Order marked as ${payload.status.toLowerCase()}`,
        data: {
            id: orderId,
            status: updated.status,
            paymentStatus: updated.paymentStatus,
        },
    };
};

export {
    checkoutPreviewService,
    checkoutService,
    listMyOrdersService,
    getMyOrderService,
    cancelOrderService,
    listShopOrdersService,
    getShopOrderService,
    updateOrderStatusService,
};
