import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import { toCents, fromCents, discountToCents } from "../../utils/money.js";
import { getOrderRefsModel, createOrderModel, getOrdersModel,getOrderByIdModel } from "./orderModel.js";

const MAX_CENTS = 999_999_999_999; // Decimal(12,2) limit

// Which products each channel may sell
const CHANNEL_PRODUCTS = { POS: ["ALL", "POS"], ADMIN: ["ALL", "WEBSITE"] };
// Staff-made orders are accepted straight away; a POS sale is handed over on the spot
const INITIAL_STATUS = { POS: "DELIVERED", ADMIN: "PROCESSING" };

const bad = (i, message) => new AppError(`Item ${i + 1}: ${message}`, constants.BadRequest);

export const createOrderService = async (storeId, actor, payload) => {
    const { channel, customerId, items } = payload;
    logger.info({ storeId, channel, items: items.length }, "Creating order");

    const productIds = [...new Set(items.map((i) => i.productId))];
    const variantIds = [...new Set(items.map((i) => i.variantId).filter(Boolean))];
    const { outlets, customer, products } = await getOrderRefsModel(storeId, customerId, productIds, variantIds);

    // ---------- customer and outlets ----------
    if (!customer) throw new AppError("Customer not found. Add the customer first", constants.NotFound);

    const outletMap = new Map(outlets.map((o) => [o.id, o]));
    const active = outlets.filter((o) => o.isActive);

    let placedAt; // the outlet the order is placed at
    let outletIds; // outlets that may supply stock
    if (channel === "POS") {
        placedAt = outletMap.get(payload.outletId);
        if (!placedAt) throw new AppError("Outlet not found", constants.NotFound);
        if (!placedAt.isActive) throw new AppError("This outlet is turned off", constants.Conflict);
        outletIds = [placedAt.id]; // a POS sale can only use what the counter holds
    } else {
        placedAt = payload.outletId ? outletMap.get(payload.outletId) : active.find((o) => o.isMain) ?? active[0];
        if (!placedAt) throw new AppError("Outlet not found", constants.NotFound);
        if (!placedAt.isActive) throw new AppError("This outlet is turned off", constants.Conflict);
        outletIds = active.map((o) => o.id); // admin orders can be fulfilled from any active outlet
    }

    // ---------- lines ----------
    const productMap = new Map(products.map((p) => [p.id, p]));
    const allowed = CHANNEL_PRODUCTS[channel];

    const lines = items.map((item, i) => {
        const product = productMap.get(item.productId);
        if (!product) throw bad(i, "product not found");
        if (product.status !== "ACTIVE") throw bad(i, `"${product.name}" is not active`);
        if (!product.isAvailable) throw bad(i, `"${product.name}" is turned off`);
        if (!allowed.includes(product.channel)) throw bad(i, `"${product.name}" is not sold on this channel`);

        let variant = null;
        if (product.hasVariants) {
            if (!item.variantId) throw bad(i, `choose a variant for "${product.name}"`);
            variant = product.variants.find((v) => v.id === item.variantId);
            if (!variant) throw bad(i, "variant doesn't belong to this product");
        } else if (item.variantId) {
            throw bad(i, `"${product.name}" has no variants`);
        }

        const price = variant ? variant.sellingPrice : product.sellingPrice;
        if (price == null) throw bad(i, `"${product.name}" has no price`);

        const unitCents = toCents(price);
        const grossCents = unitCents * item.quantity;
        const discountCents = discountToCents(item.discount, grossCents);
        if (discountCents > grossCents) throw bad(i, "the discount is more than the line total");

        return {
            index: i,
            itemKey: variant?.id ?? product.id,
            productId: product.id,
            variantId: variant?.id ?? null,
            productName: product.name,
            variantName: variant?.name ?? null,
            displayName: variant ? `${product.name} — ${variant.name}` : product.name,
            sku: variant?.sku ?? product.sku ?? null,
            image: product.imageUrls?.[0] ?? null,
            unitCents,
            quantity: item.quantity,
            grossCents,
            discount: item.discount ?? null,
            discountCents,
        };
    });

    // ---------- money (all in whole paisa, calculated here, never trusted from the client) ----------
    const subtotal = lines.reduce((s, l) => s + l.grossCents, 0);
    const lineDiscounts = lines.reduce((s, l) => s + l.discountCents, 0);
    const afterLines = subtotal - lineDiscounts;

    const orderDiscount = discountToCents(payload.discount, afterLines);
    if (orderDiscount > afterLines) throw new AppError("The order discount is more than the order amount", constants.BadRequest);

    const deliveryFee = toCents(payload.deliveryFee ?? 0);
    const total = afterLines - orderDiscount + deliveryFee;
    if (total > MAX_CENTS) throw new AppError("The order total is too large", constants.BadRequest);

    // ---------- payment ----------
    const paymentStatus = payload.paymentStatus ?? "UNPAID";
    let paid = 0;
    if (paymentStatus === "PAID") paid = total;
    if (paymentStatus === "PARTIAL_PAID") {
        paid = toCents(payload.paidAmount);
        if (paid <= 0 || paid >= total) {
            throw new AppError("For a partial payment, the paid amount must be more than 0 and less than the order total", constants.BadRequest);
        }
    }

    const order = {
        channel,
        status: INITIAL_STATUS[channel],
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email ?? null,
        province: payload.province ?? null,
        district: payload.district ?? null,
        city: payload.city ?? null,
        address: payload.address ?? placedAt.address, // POS: the outlet's address when none is given
        landmark: payload.landmark ?? null,
        orderNote: payload.orderNote ?? null,
        outletId: placedAt.id,
        subtotal: fromCents(subtotal),
        discount: fromCents(lineDiscounts + orderDiscount),
        deliveryFee: fromCents(deliveryFee),
        total: fromCents(total),
        orderDiscountType: payload.discount?.type ?? null,
        orderDiscountValue: payload.discount?.value ?? null,
        orderDiscountAmount: fromCents(orderDiscount),
        paymentMethod: payload.paymentMethod,
        paymentStatus,
        paidAmount: fromCents(paid),
    };

    const payment = paid > 0
        ? { method: payload.paymentMethod, amount: fromCents(paid), reference: payload.paymentReference ?? null }
        : null;

    // The first line of the order timeline (written in the same transaction as the order)
    const makeActivity = ({ orderNumber, fulfilledFrom }) => ({
        action: "ORDER_CREATED",
        title: `Order #${orderNumber} created from the ${channel === "POS" ? "POS" : "admin dashboard"}`,
        actorType: "USER",
        actorId: actor.id,
        actorName: actor.name ?? null,
        actorRole: actor.role ? String(actor.role).toLowerCase() : null,
        meta: {
            channel,
            itemCount: lines.length,
            totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
            subtotal: order.subtotal,
            discount: order.discount,
            deliveryFee: order.deliveryFee,
            total: order.total,
            paymentMethod: order.paymentMethod,
            paymentStatus,
            paidAmount: order.paidAmount,
            fulfilledFrom: fulfilledFrom.map((f) => ({ ...f, outletName: outletMap.get(f.outletId)?.name ?? null })),
            split: fulfilledFrom.length > 1,
        },
    });

    // ---------- save ----------
    let result;
    try {
        result = await createOrderModel(storeId, actor.id, {
            order, customerId, lines, outletIds, preferredOutletId: placedAt.id, payment, makeActivity,
        });
    } catch (error) {
        if (error?.code === "STOCK_SHORT") {
            const where = channel === "POS" ? "at this outlet" : "across your outlets";
            const list = error.shortages
                .map((s) => `"${lines[s.index].displayName}" (needed ${s.requested}, available ${s.available})`)
                .join(", ");
            throw new AppError(`Not enough stock ${where}: ${list}`, constants.Conflict);
        }
        if (error?.code === "STOCK_OUT_OF_SYNC") {
            logger.error({ err: error, storeId }, "Stock records are out of sync");
            throw new AppError("Stock records for one of the items don't match. Please run a stock check and try again", constants.Conflict);
        }
        if (error?.code === "P2025" || error?.code === "P2003") {
            throw new AppError("The customer, a product or an outlet changed while saving. Please retry", constants.Conflict);
        }
        throw error;
    }

    const { order: created, fulfilledFrom } = result;
    logger.info({ storeId, orderId: created.id, orderNumber: created.orderNumber }, "Order created");

    return {
        statusCode: 201,
        message: "Order created successfully",
        data: {
            order: {
                ...created,
                split: fulfilledFrom.length > 1,
                fulfilledFrom: fulfilledFrom.map((f) => ({ ...f, outletName: outletMap.get(f.outletId)?.name ?? null })),
            },
        },
    };
};


export const getOrdersService = async (storeId, query) => {
    const { items, total, quantities } = await getOrdersModel(storeId, query);

    return {
        statusCode: 200,
        message: "Orders fetched successfully",
        data: {
            orders: items.map((o) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                status: o.status,
                channel: o.channel,
                customerName: o.customerName,
                customerPhone: o.customerPhone,
                customerEmail: o.customerEmail,
                total: o.total,
                paymentMethod: o.paymentMethod,
                paymentStatus: o.paymentStatus,
                totalQuantity: quantities.get(o.id) ?? 0,
                createdAt: o.createdAt,
                updatedAt: o.updatedAt,
            })),
            pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
        },
    };
};



export const getOrderService = async (storeId, orderId) => {
    const o = await getOrderByIdModel(storeId, orderId);
    if (!o) throw new AppError("Order not found", constants.NotFound);

    const items = o.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        variantId: i.variantId,
        name: i.variantName ? `${i.productName} — ${i.variantName}` : i.productName,
        productName: i.productName,
        variantName: i.variantName,
        sku: i.sku,
        image: i.image,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: fromCents(toCents(i.unitPrice) * i.quantity), // quantity x unit price, before discounts
        discount: i.discountType
            ? { type: i.discountType, value: i.discountValue, amount: i.discountAmount } // PERCENT: value = the percentage
            : null,
        couponDiscountAmount: i.couponDiscountAmount,
        lineTotal: i.lineTotal, // after discounts
        fulfilledFrom: i.outlet,
    }));

    const orderDiscount = o.orderDiscountType
        ? { type: o.orderDiscountType, value: o.orderDiscountValue, amount: o.orderDiscountAmount }
        : null;

    // discount (total) = line discounts + order discount + coupon discount
    const itemDiscount = fromCents(
        toCents(o.discount) - toCents(o.orderDiscountAmount) - toCents(o.couponDiscount)
    );

    return {
        statusCode: 200,
        message: "Order fetched successfully",
        data: {
            order: {
                id: o.id,
                orderNumber: o.orderNumber,
                status: o.status,
                paymentStatus: o.paymentStatus,
                paymentMethod: o.paymentMethod,
                channel: o.channel,
                createdBy: o.createdBy, // { id, fullName } or null
                placedAt: o.outlet,
                createdAt: o.createdAt,
                updatedAt: o.updatedAt,

                summary: {
                    items,
                    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
                    subtotal: o.subtotal,
                    itemDiscount,
                    orderDiscount,
                    coupon: o.couponCode ? { code: o.couponCode, amount: o.couponDiscount } : null,
                    discount: o.discount, // all discounts together
                    deliveryFee: o.deliveryFee,
                    total: o.total,
                    paidAmount: o.paidAmount,
                    refundedAmount: o.refundedAmount,
                },

                customer: {
                    id: o.customer?.id ?? null,
                    name: o.customerName,
                    phone: o.customerPhone,
                    email: o.customerEmail,
                    province: o.province,
                    district: o.district,
                    city: o.city,
                    address: o.address,
                    landmark: o.landmark,
                    customerNote: o.customerNote,
                    orderNote: o.orderNote,
                    totalOrders: o.customer?.totalOrder ?? null,
                    customerSince: o.customer?.createdAt ?? null,
                },

                stockMovements: o.stockMovements.map((m) => ({
                    id: m.id,
                    type: m.type,
                    referenceNumber: m.referenceNumber,
                    createdAt: m.createdAt,
                    outlet: m.outlet,
                    performedBy: m.performedBy, // null = the system
                    totalProducts: m.totalProducts,
                    totalQuantity: m.totalQuantity,
                    totalValue: m.totalCost,
                    items: m.items.map((x) => ({
                        id: x.id,
                        name: x.variant ? `${x.product.name} — ${x.variant.name}` : x.product.name,
                        productId: x.product.id,
                        variantId: x.variant?.id ?? null,
                        batchId: x.batch.id,
                        batchNumber: x.batch.batchNumber,
                        batchExpiryDate: x.batch.expiryDate,
                        quantity: x.quantity,
                        unitCost: x.unitCost,
                    })),
                })),

                activities: o.activities,
            },
        },
    };
};