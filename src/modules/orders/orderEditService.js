import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import {
    groupRows,
    planItemChanges,
    planReleases,
    assertEditable,
    buildLinesFromRequest,
    buildLinesFromGroups,
    calcTotals,
    calcPayment,
    unchanged,
    mapEditError,
    buildSummaryActivities,
    toOrderPatch,
    toPayments,
    planCustomerChanges,
    buildCustomerActivities,
} from "./orderUtils/orderEdit.js";
import {
    getOrderForEditModel,
    getOrderForCustomerEditModel,
    getActiveOutletIdsModel,
    getOrderNetPicksModel,
    findCustomerByPhoneModel,
    updateOrderSummaryModel,
    updateOrderCustomerModel,
} from "./orderEditModel.js";

// ---------- loading ----------
// The order, the active outlets and (only when items are edited) the stock history: all at once
const loadEditContext = async (storeId, orderId, payload) => {
    const [order, activeOutletIds, netPicks] = await Promise.all([
        getOrderForEditModel(storeId, orderId),
        getActiveOutletIdsModel(storeId),
        payload.items ? getOrderNetPicksModel(storeId, orderId) : [],
    ]);
    if (!order) throw new AppError("Order not found", constants.NotFound);
    assertEditable(order);

    return {
        order,
        netPicks,
        groups: groupRows(order.items, order.outletId),
        // a POS sale can only use its own outlet; other orders can use any active outlet
        outletIds: order.channel === "POS" ? [order.outletId] : activeOutletIds,
    };
};

// ====================== 1. ORDER SUMMARY ======================
export const updateOrderSummaryService = async (storeId, actor, orderId, payload) => {
    logger.info({ storeId, orderId }, "Updating order summary");

    const { order, groups, outletIds, netPicks } = await loadEditContext(storeId, orderId, payload);

    // 1. What the order should look like, and what that means for stock
    const lines = payload.items
        ? await buildLinesFromRequest(storeId, order, groups, payload.items)
        : buildLinesFromGroups(groups);
    const plans = payload.items ? planItemChanges(groups, lines) : [];
    const restores = planReleases(plans, netPicks.map((p) => ({ ...p })));

    // 2. Money and payment (pure calculations)
    const t = calcTotals({ lines, order, payload });
    const pay = calcPayment({ order, payload, total: t.total });

    if (plans.length === 0 && !t.feeChanged && !t.discountChanged && !pay.changed) {
        return unchanged(order);
    }

    // 3. Save everything in one transaction
    try {
        await updateOrderSummaryModel(storeId, actor.id, {
            orderId,
            orderNumber: order.orderNumber,
            expectedUpdatedAt: order.updatedAt,
            plans,
            restores,
            outletIds,
            preferredOutletId: order.outletId,
            order: toOrderPatch(t, pay),
            payments: toPayments(order, actor, pay, payload.paymentReference),
            activities: buildSummaryActivities({ actor, order, groups, lines, plans, t, pay }),
        });
    } catch (error) {
        throw mapEditError(error);
    }

    logger.info({ storeId, orderId }, "Order summary updated");
    return {
        statusCode: 200,
        message: "Order updated successfully",
        data: {
            id: order.id,
            orderNumber: order.orderNumber,
        },
    };
};

// ====================== 2. CUSTOMER DETAILS ======================
export const updateOrderCustomerService = async (storeId, actor, orderId, payload) => {
    logger.info({ storeId, orderId }, "Updating order customer details");

    const order = await getOrderForCustomerEditModel(storeId, orderId);
    if (!order) throw new AppError("Order not found", constants.NotFound);
    assertEditable(order);

    // Same number: nothing changes on the customer. A different number: the customer table decides.
    const phoneChanged = payload.phone !== undefined && payload.phone !== order.customerPhone;
    const target = phoneChanged ? await findCustomerByPhoneModel(storeId, payload.phone) : null;
    const moved = phoneChanged && (target?.id ?? null) !== order.customerId;

    const { patch, changes } = planCustomerChanges({ order, payload, target, moved });

    if (changes.length === 0 && !moved) {
        return unchanged(order, "Customer details updated successfully");
    }

    const activities = buildCustomerActivities({ actor, changes, moved, order, target });

    try {
        await updateOrderCustomerModel(storeId, {
            orderId,
            expectedUpdatedAt: order.updatedAt,
            patch,
            activities,
            decrementCustomerId: moved ? order.customerId : null, // the order leaves this customer
            incrementCustomerId: moved && target ? target.id : null, // and joins this one
        });
    } catch (error) {
        throw mapEditError(error);
    }

    logger.info({ storeId, orderId, moved }, "Order customer details updated");
    return {
        statusCode: 200,
        message: "Customer details updated successfully",
        data: {
            id: order.id,
            orderNumber: order.orderNumber,
        },
    };
};