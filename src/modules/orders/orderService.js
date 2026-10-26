import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import { fromCents } from "../../utils/money.js";
import { getOrderRefsModel, createOrderModel, getOrdersModel, getOrderByIdModel,  } from "./orderModel.js";
import {
    resolveOrderOutlets,
    buildCreateOrderLines,
    calcCreateOrderTotals,
    calcCreatePayment,
    buildCreateOrderEntity,
    buildCreateOrderActivity,
    mapCreateOrderError,
    formatOrderListItem,
    formatOrderDetails,
} from "./orderHelpers/orderCreateHelper.js";

// ====================== 1. CREATE ORDER ======================
export const createOrderService = async (storeId, actor, payload) => {
    const { channel, customerId, items } = payload;
    logger.info({ storeId, channel, items: items.length }, "Creating order");

    const productIds = [...new Set(items.map((i) => i.productId))];
    const variantIds = [...new Set(items.map((i) => i.variantId).filter(Boolean))];
    const { outlets, customer, products } = await getOrderRefsModel(storeId, customerId, productIds, variantIds);

    if (!customer) throw new AppError("Customer not found. Add the customer first", constants.NotFound);

    const { placedAt, outletIds, outletMap } = resolveOrderOutlets(channel, payload.outletId, outlets);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const lines = buildCreateOrderLines(items, productMap, channel);

    const t = calcCreateOrderTotals({ lines, payload });
    const pay = calcCreatePayment({ payload, total: t.total });
    const order = buildCreateOrderEntity({ channel, customer, payload, placedAt, t, pay });
    const payment = pay.paid > 0
        ? { method: payload.paymentMethod, amount: fromCents(pay.paid), reference: payload.paymentReference ?? null }
        : null;
    const makeActivity = buildCreateOrderActivity({ actor, channel, order, lines, outletMap });

    let result;
    try {
        result = await createOrderModel(storeId, actor.id, {
            order,
            customerId,
            lines,
            outletIds,
            preferredOutletId: placedAt.id,
            payment,
            makeActivity,
        });
    } catch (error) {
        throw mapCreateOrderError(error, channel, lines, storeId);
    }

    const { order: created } = result;
    logger.info({ storeId, orderId: created.id, orderNumber: created.orderNumber }, "Order created");

    return {
        statusCode: 201,
        message: "Order created successfully",
        data: {
            id: created.id,
            orderNumber: created.orderNumber,
            customerName: created.customerName,
            customerPhone: created.customerPhone,
        },
    };
};

// ====================== 2. GET ORDERS (PAGINATED) ======================
export const getOrdersService = async (storeId, query) => {
    const { items, total, quantities } = await getOrdersModel(storeId, query);

    return {
        statusCode: 200,
        message: "Orders fetched successfully",
        data: {
            orders: items.map((o) => formatOrderListItem(o, quantities)),
            pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
        },
    };
};

// ====================== 3. GET ORDER DETAILS ======================
export const getOrderService = async (storeId, orderId) => {
    const o = await getOrderByIdModel(storeId, orderId);
    if (!o) throw new AppError("Order not found", constants.NotFound);

    return {
        statusCode: 200,
        message: "Order fetched successfully",
        data: {
            order: formatOrderDetails(o),
        },
    };
};

