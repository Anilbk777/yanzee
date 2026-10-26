import logger from "../../../utils/logger.js";
import AppError from "../../../utils/AppError.js";
import constants from "../../../utils/constants.js";
import { toCents, fromCents, discountToCents } from "../../../utils/money.js";
import { getProductsForOrderModel } from "../orderEditModel.js";

export const itemKeyOf = (productId, variantId) => variantId ?? productId;

export const sameDiscount = (a, b) => {
    if (!a || !b) return !a && !b;
    return a.type === b.type && Math.round(a.value * 100) === Math.round(b.value * 100);
};

// Order rows -> one entry per product / variant. A line split across outlets has several rows.
// Rows are sorted so the order's own outlet comes first; units are released from the END,
// so stock taken from other outlets goes back first.
export const groupRows = (rows, orderOutletId) => {
    const groups = new Map();

    for (const r of rows) {
        const key = itemKeyOf(r.productId, r.variantId);
        const g = groups.get(key) ?? {
            itemKey: key, productId: r.productId, variantId: r.variantId,
            productName: r.productName, variantName: r.variantName, sku: r.sku, image: r.image,
            unitCents: toCents(r.unitPrice), quantity: 0, rows: [], discountCents: 0,
            discountType: r.discountType, percent: r.discountValue,
        };
        g.quantity += r.quantity;
        g.discountCents += toCents(r.discountAmount);
        g.rows.push({ id: r.id, outletId: r.outletId, quantity: r.quantity });
        groups.set(key, g);
    }

    for (const g of groups.values()) {
        g.rows.sort((a, b) => (b.outletId === orderOutletId) - (a.outletId === orderOutletId) || a.outletId.localeCompare(b.outletId));
        // FIXED rows each hold their share, so the line's amount is their sum. PERCENT repeats the percentage.
        g.discount = g.discountType
            ? { type: g.discountType, value: g.discountType === "FIXED" ? g.discountCents / 100 : Number(g.percent) }
            : null;
    }
    return groups;
};

// What changes, per item. Items that are identical are left out.
export const planItemChanges = (groups, lines) => {
    const plans = [];
    const seen = new Set();

    for (const line of lines) {
        seen.add(line.itemKey);
        const g = groups.get(line.itemKey);

        if (!g) {
            plans.push({ kind: "add", itemKey: line.itemKey, line, current: [], delta: line.quantity });
        } else if (g.quantity !== line.quantity || !sameDiscount(g.discount, line.discount)) {
            plans.push({ kind: "change", itemKey: line.itemKey, line, group: g, current: g.rows, delta: line.quantity - g.quantity });
        }
    }
    for (const g of groups.values()) {
        if (!seen.has(g.itemKey)) plans.push({ kind: "remove", itemKey: g.itemKey, group: g, current: g.rows, delta: -g.quantity });
    }
    return plans;
};

// For every item that shrinks: which outlet gives units back, and into which batches.
// netPicks = units this order still holds per batch (taken minus already restored), latest first.
// Sets plan.remaining (the item's rows after the release).
export const planReleases = (plans, netPicks) => {
    const restores = [];

    for (const plan of plans) {
        if (plan.delta >= 0) continue;

        let toRelease = -plan.delta;
        plan.remaining = plan.current.map((r) => ({ ...r }));

        for (let i = plan.remaining.length - 1; i >= 0 && toRelease > 0; i--) {
            const row = plan.remaining[i];
            const give = Math.min(row.quantity, toRelease);
            row.quantity -= give;
            toRelease -= give;

            let left = give;
            for (const p of netPicks) {
                if (left === 0) break;
                if (p.net === 0 || p.outletId !== row.outletId || p.itemKey !== plan.itemKey) continue;
                const q = Math.min(p.net, left);
                p.net -= q;
                left -= q;
                restores.push({
                    batchId: p.batchId, outletId: p.outletId, productId: p.productId, variantId: p.variantId,
                    itemKey: p.itemKey, quantity: q, unitCost: p.unitCost, sellable: p.sellable,
                });
            }
            if (left > 0) throw Object.assign(new Error("Stock history out of sync"), { code: "STOCK_OUT_OF_SYNC" });
        }
    }
    return restores;
};



// =============================Edit Helpers =========================================================

export const EDITABLE_STATUSES = ["PENDING", "PROCESSING"];

export const bad = (i, message) => new AppError(`Item ${i + 1}: ${message}`, constants.BadRequest);
export const nameOf = (product, variant) => (variant ? `${product} — ${variant}` : product);
export const rs = (cents) => `Rs ${fromCents(cents)}`;
export const fmtDiscount = (d) => (d ? (d.type === "PERCENT" ? `${d.value}%` : `Rs ${d.value}`) : "none");

export const actorFields = (actor) => ({
    actorType: "USER",
    actorId: actor.id,
    actorName: actor.name ?? null,
    actorRole: actor.role ? String(actor.role).toLowerCase() : null,
});

export const assertEditable = (order) => {
    if (!EDITABLE_STATUSES.includes(order.status)) {
        throw new AppError(`A ${order.status.toLowerCase()} order can't be edited`, constants.Conflict);
    }
};

export const mapEditError = (error) => {
    if (error?.code === "ORDER_CHANGED") {
        return new AppError("This order was changed by someone else. Reload it and try again", constants.Conflict);
    }
    if (error?.code === "STOCK_SHORT") {
        const list = error.shortages
            .map((s) => `"${s.displayName}" (needs ${s.requested} more, available ${s.available})`)
            .join(", ");
        return new AppError(`Not enough stock: ${list}`, constants.Conflict);
    }
    if (error?.code === "STOCK_OUT_OF_SYNC") {
        logger.error({ err: error }, "Stock records are out of sync");
        return new AppError("Stock records for one of the items don't match. Please run a stock check and try again", constants.Conflict);
    }
    if (error?.code === "P2025" || error?.code === "P2003") {
        return new AppError("The order, a customer or a product changed while saving. Please retry", constants.Conflict);
    }
    return error;
};

// Nothing to save: return order id and order number with success
export const unchanged = (order, message = "Order updated successfully") => ({
    statusCode: 200,
    message,
    data: {
        id: order.id,
        orderNumber: order.orderNumber,
    },
});



// ==================================== orderEditLines ================================================


const CHANNEL_PRODUCTS = { POS: ["ALL", "POS"], ADMIN: ["ALL", "WEBSITE"], WEBSITE: ["ALL", "WEBSITE"] };

// An item already on the order keeps its price and names
const snapshotOfExisting = (g, item, i) => {
    if (g.productId !== item.productId) throw bad(i, "variant doesn't belong to this product");
    return {
        productId: g.productId, variantId: g.variantId, productName: g.productName,
        variantName: g.variantName, sku: g.sku, image: g.image, unitCents: g.unitCents,
    };
};

// A new item gets the same checks as order creation, and the current price
const snapshotOfNew = (item, i, product, channel) => {
    if (!product) throw bad(i, "product not found");
    if (product.status !== "ACTIVE") throw bad(i, `"${product.name}" is not active`);
    if (!product.isAvailable) throw bad(i, `"${product.name}" is turned off`);
    if (!CHANNEL_PRODUCTS[channel].includes(product.channel)) throw bad(i, `"${product.name}" is not sold on this channel`);

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

    return {
        productId: product.id, variantId: variant?.id ?? null, productName: product.name,
        variantName: variant?.name ?? null, sku: variant?.sku ?? product.sku ?? null,
        image: product.imageUrls?.[0] ?? null, unitCents: toCents(price),
    };
};

// snapshot + the requested quantity and discount -> one line
const toLine = (i, key, snap, item) => {
    const grossCents = snap.unitCents * item.quantity;
    const discountCents = discountToCents(item.discount, grossCents);
    if (discountCents > grossCents) throw bad(i, "the discount is more than the line total");

    return {
        index: i, itemKey: key, ...snap,
        displayName: nameOf(snap.productName, snap.variantName),
        quantity: item.quantity, grossCents, discount: item.discount ?? null, discountCents,
    };
};

// The request's items -> lines. Only items that are NOT on the order yet are loaded from the database.
export const buildLinesFromRequest = async (storeId, order, groups, items) => {
    const fresh = items.filter((i) => !groups.has(itemKeyOf(i.productId, i.variantId)));

    const products = fresh.length
        ? await getProductsForOrderModel(
              storeId,
              [...new Set(fresh.map((i) => i.productId))],
              [...new Set(fresh.map((i) => i.variantId).filter(Boolean))]
          )
        : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    return items.map((item, i) => {
        const key = itemKeyOf(item.productId, item.variantId);
        const g = groups.get(key);
        const snap = g ? snapshotOfExisting(g, item, i) : snapshotOfNew(item, i, productMap.get(item.productId), order.channel);
        return toLine(i, key, snap, item);
    });
};

// Items not sent: the lines are the order as it is, so only the money is recalculated
export const buildLinesFromGroups = (groups) =>
    [...groups.values()].map((g, i) => ({
        index: i, itemKey: g.itemKey, productId: g.productId, variantId: g.variantId,
        productName: g.productName, variantName: g.variantName, sku: g.sku, image: g.image,
        unitCents: g.unitCents, displayName: nameOf(g.productName, g.variantName),
        quantity: g.quantity, grossCents: g.unitCents * g.quantity, discount: g.discount, discountCents: g.discountCents,
    }));


//  ============================= orderEditMoney =============================================================


const MAX_CENTS = 999_999_999_999; // Decimal(12,2) limit

// Totals in whole paisa. The order discount applies to the amount after line discounts.
export const calcTotals = ({ lines, order, payload }) => {
    const subtotal = lines.reduce((s, l) => s + l.grossCents, 0);
    const lineDiscounts = lines.reduce((s, l) => s + l.discountCents, 0);
    const afterLines = subtotal - lineDiscounts;

    // object = set, null = removed, undefined = unchanged
    const currentDiscount = order.orderDiscountType
        ? { type: order.orderDiscountType, value: Number(order.orderDiscountValue) }
        : null;
    const nextDiscount = payload.discount === undefined ? currentDiscount : payload.discount;
    const orderDiscount = discountToCents(nextDiscount, afterLines);
    const coupon = toCents(order.couponDiscount);

    if (orderDiscount + coupon > afterLines) {
        throw new AppError("The order discount is more than the order amount. Lower or remove it", constants.BadRequest);
    }

    const currentFee = toCents(order.deliveryFee);
    const fee = payload.deliveryFee === undefined ? currentFee : toCents(payload.deliveryFee);
    const total = afterLines - orderDiscount - coupon + fee;
    if (total > MAX_CENTS) throw new AppError("The order total is too large", constants.BadRequest);

    return {
        subtotal, lineDiscounts, orderDiscount, coupon, fee, total,
        allDiscounts: lineDiscounts + orderDiscount + coupon,
        currentDiscount, nextDiscount,
        feeChanged: fee !== currentFee,
        discountChanged: !sameDiscount(currentDiscount, nextDiscount),
    };
};

// paidAmount = all money received (never goes down). refundedAmount = all money given back.
// Net paid = paid - refunded. If net paid is above the new total, the difference is refunded.
export const calcPayment = ({ order, payload, total }) => {
    const currentPaid = toCents(order.paidAmount);
    const currentRefunded = toCents(order.refundedAmount);
    const currentNet = currentPaid - currentRefunded;

    let targetNet = currentNet;
    if (payload.paymentStatus === "PAID") targetNet = Math.max(total, currentNet);
    if (payload.paymentStatus === "PARTIAL_PAID") targetNet = toCents(payload.paidAmount);
    if (payload.paymentStatus === "UNPAID") targetNet = 0;

    if (targetNet < currentNet) {
        throw new AppError("The paid amount can't be lowered here. Money already received can only be returned as a refund", constants.Conflict);
    }
    if (payload.paymentStatus === "PARTIAL_PAID" && (targetNet <= 0 || targetNet >= total)) {
        throw new AppError("For a partial payment, the paid amount must be more than 0 and less than the order total", constants.BadRequest);
    }

    const received = targetNet - currentNet; // new money taken now
    const refund = Math.max(0, targetNet - total); // paid more than the order now costs
    const newPaid = currentPaid + received;
    const newRefunded = currentRefunded + refund;
    const finalNet = targetNet - refund;

    let status;
    if (total > 0 && finalNet >= total) status = "PAID";
    else if (finalNet === 0) status = newRefunded > 0 ? "REFUNDED" : "UNPAID";
    else status = "PARTIAL_PAID";

    return {
        currentNet, received, refund, newPaid, newRefunded, finalNet, status,
        changed: received > 0 || refund > 0 || status !== order.paymentStatus,
    };
};

//  ======================================  orderEditActivities ============================================================


const brief = (name, quantity, unitCents, discount) => ({ name, quantity, unitPrice: fromCents(unitCents), discount });

const itemsEntry = (base, { order, groups, lines, plans, t }) => {
    const count = (kind) => plans.filter((p) => p.kind === kind).length;
    const parts = [
        count("add") && `${count("add")} added`,
        count("remove") && `${count("remove")} removed`,
        count("change") && `${count("change")} updated`,
    ].filter(Boolean);

    return {
        ...base, action: "ITEMS_EDITED",
        title: `Edited order items (${parts.join(", ")})`,
        meta: {
            before: { items: [...groups.values()].map((g) => brief(nameOf(g.productName, g.variantName), g.quantity, g.unitCents, g.discount)) },
            after: { items: lines.map((l) => brief(l.displayName, l.quantity, l.unitCents, l.discount)) },
            totals: {
                before: { subtotal: order.subtotal, discount: order.discount, deliveryFee: order.deliveryFee, total: order.total },
                after: { subtotal: fromCents(t.subtotal), discount: fromCents(t.allDiscounts), deliveryFee: fromCents(t.fee), total: fromCents(t.total) },
            },
        },
    };
};

const discountEntry = (base, t) => ({
    ...base, action: "DISCOUNT_CHANGED",
    title: `Changed order discount from ${fmtDiscount(t.currentDiscount)} to ${fmtDiscount(t.nextDiscount)}`,
    meta: { before: t.currentDiscount, after: t.nextDiscount },
});

const feeEntry = (base, order, t) => ({
    ...base, action: "ORDER_EDITED",
    title: `Changed delivery fee from ${rs(Math.round(Number(order.deliveryFee) * 100))} to ${rs(t.fee)}`,
    meta: { deliveryFee: { from: order.deliveryFee, to: fromCents(t.fee) } },
});

const refundEntry = (base, order, t, pay) => ({
    ...base, action: "PAYMENT_STATUS_CHANGED",
    title: `Refund of ${rs(pay.refund)} recorded because the order total is now ${rs(t.total)} (the customer had paid ${rs(pay.currentNet)})`,
    meta: { refund: fromCents(pay.refund), total: fromCents(t.total), netPaidBefore: fromCents(pay.currentNet), method: order.paymentMethod },
});

const paymentEntry = (base, order, pay) => ({
    ...base, action: "PAYMENT_STATUS_CHANGED",
    title: pay.status !== order.paymentStatus
        ? `Changed payment status from ${order.paymentStatus} to ${pay.status} (paid ${rs(pay.finalNet)})`
        : `Recorded a payment of ${rs(pay.received)} (total paid ${rs(pay.finalNet)})`,
    meta: { from: order.paymentStatus, to: pay.status, paidFrom: fromCents(pay.currentNet), paidTo: fromCents(pay.finalNet), method: order.paymentMethod },
});

// Only the things that actually changed get an entry
export const buildSummaryActivities = ({ actor, order, groups, lines, plans, t, pay }) => {
    const base = actorFields(actor);
    const entries = [];

    if (plans.length > 0) entries.push(itemsEntry(base, { order, groups, lines, plans, t }));
    if (t.discountChanged) entries.push(discountEntry(base, t));
    if (t.feeChanged) entries.push(feeEntry(base, order, t));
    if (pay.refund > 0) entries.push(refundEntry(base, order, t, pay));
    if (pay.received > 0 || (pay.status !== order.paymentStatus && pay.refund === 0)) entries.push(paymentEntry(base, order, pay));

    return entries;
};

// ==================================== Order Summary Mappings ====================================

export const toOrderPatch = (t, pay) => ({
    subtotal: fromCents(t.subtotal),
    discount: fromCents(t.allDiscounts),
    deliveryFee: fromCents(t.fee),
    total: fromCents(t.total),
    orderDiscountType: t.nextDiscount?.type ?? null,
    orderDiscountValue: t.nextDiscount?.value ?? null,
    orderDiscountAmount: fromCents(t.orderDiscount),
    paymentStatus: pay.status,
    paidAmount: fromCents(pay.newPaid),
    refundedAmount: fromCents(pay.newRefunded),
});

export const toPayments = (order, actor, pay, reference) =>
    [
        pay.received > 0 && {
            kind: "PAYMENT",
            method: order.paymentMethod,
            status: "SUCCESS",
            amount: fromCents(pay.received),
            reference: reference ?? null,
            receivedById: actor.id,
        },
        pay.refund > 0 && {
            kind: "REFUND",
            method: order.paymentMethod,
            status: "SUCCESS",
            amount: fromCents(pay.refund),
            note: "Order total reduced after an edit",
            receivedById: actor.id,
        },
    ].filter(Boolean);

// ==================================== Customer Edit Helpers ====================================

// [request key, order column, activity action, label]
export const CUSTOMER_FIELDS = [
    ["name", "customerName", "CUSTOMER_NAME_EDITED", "name"],
    ["email", "customerEmail", "CUSTOMER_EMAIL_EDITED", "email"],
    ["phone", "customerPhone", "CUSTOMER_PHONE_EDITED", "phone number"],
    ["province", "province", "CUSTOMER_PROVINCE_EDITED", "province"],
    ["district", "district", "CUSTOMER_DISTRICT_EDITED", "district"],
    ["city", "city", "CUSTOMER_CITY_EDITED", "city"],
    ["address", "address", "CUSTOMER_ADDRESS_EDITED", "address"],
    ["landmark", "landmark", "CUSTOMER_LANDMARK_EDITED", "landmark"],
    ["customerNote", "customerNote", "CUSTOMER_NOTE_EDITED", "customer note"],
];

export const fieldTitle = (label, from, to) => {
    if (from == null) return `Added ${label} "${to}"`;
    if (to == null) return `Removed ${label} "${from}"`;
    return `Changed ${label} from "${from}" to "${to}"`;
};

export const planCustomerChanges = ({ order, payload, target, moved }) => {
    const patch = {};
    const changes = [];

    for (const [key, column, action, label] of CUSTOMER_FIELDS) {
        let value = payload[key];
        // moved to another existing customer: take their name and email unless the request gives them
        if (moved && target && value === undefined) {
            if (key === "name") value = target.name;
            else if (key === "email") value = target.email;
        }

        if (value === undefined || value === order[column]) continue;
        patch[column] = value;
        changes.push({ key, action, label, from: order[column], to: value });
    }
    if (moved) patch.customerId = target?.id ?? null; // existing customer = link, new number = unlinked

    return { patch, changes };
};

export const buildCustomerActivities = ({ actor, changes, moved, order, target }) => {
    const base = actorFields(actor);
    return changes.map((c) => ({
        ...base,
        action: c.action,
        title: fieldTitle(c.label, c.from, c.to),
        meta: {
            from: c.from,
            to: c.to,
            ...(c.key === "phone" && moved && { customer: { from: order.customerId, to: target?.id ?? null } }),
        },
    }));
};
