import crypto from "node:crypto";
import prisma, { Prisma } from "../../config/dbConfig.js";

// -----------------------------------------------------------------------------
// READ PATHS ARE RAW SQL, SAME REASON AS PRODUCTS
//
// The database is remote and a round trip costs ~500ms. Prisma loads
// `items` and `history` with one extra query each, so a single order would cost
// three round trips (~1.5s). One statement with json_agg keeps it at one.
//
// WRITES STAY ON PRISMA: checkout needs a real interactive transaction, and
// nesting order creation with history rows is what Prisma is good at.
// -----------------------------------------------------------------------------

// Order fields carry no @map in schema.prisma, so the column names are the
// Prisma field names verbatim and must stay double-quoted.
const ORDER_COLUMNS = Prisma.sql`
    o.id,
    o."orderNumber"    AS "orderNumber",
    o."checkoutId"     AS "checkoutId",
    o."customerId"     AS "customerId",
    o."shopId"         AS "shopId",
    o.status,
    o."declineReason"  AS "declineReason",
    o.subtotal::text   AS subtotal,
    o."shippingFee"::text AS "shippingFee",
    o.discount::text   AS discount,
    o.total::text      AS total,
    o."paymentMethod"  AS "paymentMethod",
    o."paymentStatus"  AS "paymentStatus",
    o."recipientName"  AS "recipientName",
    o."recipientPhone" AS "recipientPhone",
    o.province,
    o.district,
    o.city,
    o.address,
    o."customerNote"   AS "customerNote",
    o."courierName"    AS "courierName",
    o."trackingNumber" AS "trackingNumber",
    o."acceptedAt"     AS "acceptedAt",
    o."readyAt"        AS "readyAt",
    o."dispatchedAt"   AS "dispatchedAt",
    o."deliveredAt"    AS "deliveredAt",
    o."createdAt"      AS "createdAt",
    o."updatedAt"      AS "updatedAt"
`;

// order_items and order_status_history were created with the Prisma field
// names as columns (see migration 20260929075927), so these two tables are
// quoted-cased differently from products/product_variants.
const ITEM_JSON = Prisma.sql`
    COALESCE(
        json_agg(
            json_build_object(
                'id', i.id,
                'productId', i."productId",
                'variantId', i."variantId",
                'productName', i."productName",
                'image', i.image,
                'size', i.size,
                'unitPrice', i."unitPrice"::text,
                'quantity', i.quantity,
                'lineTotal', i."lineTotal"::text
            ) ORDER BY i."productName"
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::json
    ) AS items
`;

const HISTORY_JSON = Prisma.sql`
    COALESCE(
        json_agg(
            json_build_object(
                'id', h.id,
                'status', h.status,
                'note', h.note,
                'changedBy', h."changedBy",
                'createdAt', h."createdAt"
            ) ORDER BY h."createdAt"
        ) FILTER (WHERE h.id IS NOT NULL),
        '[]'::json
    ) AS history
`;

// Thrown from inside the checkout transaction so the rollback happens with it.
// The service translates this into the HTTP response; the model does not
// import AppError so the data layer stays free of HTTP concerns.
export class StockConflictError extends Error {
    constructor({ productName, size, available }) {
        super(`Only ${available} left of ${productName} (${size})`);
        this.name = "StockConflictError";
        this.available = available;
    }
}

const pad = (value) => String(value).padStart(2, "0");

// Short, human-readable, and unique per day. The @unique constraint on
// orderNumber is the real guarantee; a collision is retried, not trusted.
const generateOrderNumber = () => {
    const now = new Date();
    const stamp = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
    return `YNZ-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

export { generateOrderNumber };

// -----------------------------------------------------------------------------
// CHECKOUT
// -----------------------------------------------------------------------------

// Resolves the requested (productId, size) pairs in ONE statement and returns
// the authoritative price, stock, shop and status. The client never sends a
// price, so the order totals cannot be tampered with.
//
// unnest() of two parallel arrays preserves the pairing that a plain
// `id IN (...) AND size IN (...)` would lose: asking for product A/S and
// product B/M must not also match product A/M.
export const resolveCheckoutItems = async (items) => {
    const productIds = items.map((item) => item.productId);
    const sizes = items.map((item) => item.size);

    return await prisma.$queryRaw`
        SELECT
            p.id              AS "productId",
            p."shop_id"       AS "shopId",
            s.name            AS "shopName",
            p.name            AS "productName",
            p.image           AS image,
            p.status          AS "productStatus",
            p.price::text     AS price,
            p."discountPrice"::text AS "discountPrice",
            v.id              AS "variantId",
            v.size,
            v.stock
        FROM unnest(${productIds}::text[], ${sizes}::text[])
            AS req("productId", "size")
        JOIN products p
            ON p.id = req."productId"
        JOIN shops s
            ON s.id = p."shop_id"
        JOIN product_variants v
            ON v."product_id" = p.id
            AND v.size = req."size"::"Size"
    `;
};

// Creates one order per shop plus its items and the first history row, and
// decrements stock, all inside a single transaction so a failure anywhere
// rolls the whole checkout back.
//
// The transaction is deliberately a FIXED small number of statements rather
// than a loop per order line. Every round trip to this remote database costs
// ~500ms, so a per-line loop times out the 5s default the moment a cart has
// a few items: stock is decremented in ONE statement and the rows are written
// with createMany, giving 4 statements for any number of shops and lines.
//
// Stock safety: the decrement carries a `v.stock >= req.qty` guard inside the
// UPDATE, so two customers racing for the last unit serialise on the row lock.
// The loser's row simply is not updated, the counts come back unequal, and
// throwing rolls the whole transaction back - stock can never go negative.
export const createCheckout = async ({ customerId, groups, checkoutId, paymentMethod, address, shippingFee }) => {
    const orderRows = [];
    const itemRows = [];
    const historyRows = [];

    for (const group of groups) {
        const subtotal = round2(group.items.reduce(
            (sum, item) => sum + item.unitPrice * item.quantity,
            0
        ));
        // The per-order shipping fee is the customer's total split across the
        // shops in the checkout, so the sum of order totals always equals the
        // amount the customer was quoted.
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

    const allItems = groups.flatMap((group) => group.items);
    const stockRequest = Prisma.join(
        allItems.map((item) => Prisma.sql`(${item.variantId}::text, ${item.quantity}::int)`),
        ", "
    );

    return await prisma.$transaction(async (tx) => {
        const [stock] = await tx.$queryRaw`
            WITH req("variantId", qty) AS (VALUES ${stockRequest}),
            upd AS (
                UPDATE product_variants v
                SET stock = v.stock - req.qty, "updated_at" = now()
                FROM req
                WHERE v.id = req."variantId" AND v.stock >= req.qty
                RETURNING v.id
            )
            SELECT
                (SELECT count(*) FROM req)::int AS requested,
                (SELECT count(*) FROM upd)::int AS updated,
                (
                    SELECT array_agg(r."variantId")
                    FROM req r
                    WHERE r."variantId" NOT IN (SELECT id FROM upd)
                ) AS failed
        `;

        if (stock.updated !== stock.requested) {
            const failedIds = new Set(stock.failed ?? []);
            const short = allItems.find((item) => failedIds.has(item.variantId)) ?? allItems[0];

            throw new StockConflictError({
                productName: short.productName,
                size: short.size,
                available: short.stock,
            });
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

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

// -----------------------------------------------------------------------------
// READS
// -----------------------------------------------------------------------------

// Items and history are aggregated in SEPARATE CTEs rather than joined
// together. Joining both to `orders` in one query multiplies the rows - an
// order with 2 items and 1 history row yields 2 rows, and json_agg would then
// report the same history entry twice. Pre-aggregating keeps each list exact.
//
// The CTEs are filtered by orderId so they resolve through the
// order_items_orderId_idx / order_status_history_orderId_idx indexes instead
// of scanning the whole table.
export const getOrderById = async (orderId) => {
    const rows = await prisma.$queryRaw`
        WITH items AS (
            SELECT i."orderId", ${ITEM_JSON}
            FROM order_items i
            WHERE i."orderId" = ${orderId}
            GROUP BY i."orderId"
        ),
        history AS (
            SELECT h."orderId", ${HISTORY_JSON}
            FROM order_status_history h
            WHERE h."orderId" = ${orderId}
            GROUP BY h."orderId"
        )
        SELECT
            ${ORDER_COLUMNS},
            COALESCE(i.items, '[]'::json) AS items,
            COALESCE(h.history, '[]'::json) AS history
        FROM orders o
        LEFT JOIN items i ON i."orderId" = o.id
        LEFT JOIN history h ON h."orderId" = o.id
        WHERE o.id = ${orderId}
    `;

    return rows[0] ?? null;
};

// `scope` is either "customer" or "shop"; it picks the column and the index.
// The page CTE is the same pattern used in productModel.js: bound the scan to
// one page before aggregating items, otherwise the [customerId, createdAt] /
// [shopId, status] indexes are not used.
export const listOrders = async ({ scope, ownerId, page, limit, status, search }) => {
    const filters = [Prisma.sql`o.${Prisma.raw(scope === "shop" ? `"shopId"` : `"customerId"`)} = ${ownerId}`];

    if (status) filters.push(Prisma.sql`o.status = ${status}::"OrderStatus"`);
    if (search) filters.push(Prisma.sql`o."orderNumber" ILIKE ${`%${search}%`}`);

    const where = {
        [scope === "shop" ? "shopId" : "customerId"]: ownerId,
        ...(status ? { status } : {}),
        ...(search ? { orderNumber: { contains: search, mode: "insensitive" } } : {}),
    };

    const [orders, total] = await Promise.all([
        prisma.$queryRaw`
            WITH page AS (
                SELECT o.id
                FROM orders o
                WHERE ${Prisma.join(filters, " AND ")}
                ORDER BY o."createdAt" DESC
                LIMIT ${limit} OFFSET ${(page - 1) * limit}
            )
            SELECT
                ${ORDER_COLUMNS},
                s.name AS "shopName",
                ${ITEM_JSON}
            FROM page
            JOIN orders o ON o.id = page.id
            JOIN shops s ON s.id = o."shopId"
            LEFT JOIN order_items i ON i."orderId" = o.id
            GROUP BY o.id, s.name
            ORDER BY o."createdAt" DESC
        `,
        prisma.order.count({ where }),
    ]);

    return { orders, total };
};

// -----------------------------------------------------------------------------
// STATUS TRANSITIONS
// -----------------------------------------------------------------------------

// Single round trip that both authorises the shop and fetches the rows needed
// to move the order on, so the transition costs one read and one write.
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

// Everything a transition touches happens in one transaction: the status and
// its timestamp, the history row, the courier fields, the payment status and
// (when stock is coming back) the restock.
//
// The `status: currentStatus` guard on the update makes a concurrent
// transition a no-op instead of an overwrite, so two tabs cannot both accept
// the same order; zero rows updated means someone else acted first and the
// caller turns that into a 409. Restock is a single statement rather than one
// per line, for the same round-trip reason as checkout.
export const applyStatusChange = async ({ orderId, currentStatus, nextStatus, declineReason, note, changedBy, courierName, trackingNumber, restock, paymentStatus }) => {
    const now = new Date();

    const timestamps = {
        ACCEPTED: { acceptedAt: now },
        READY: { readyAt: now },
        DISPATCHED: { dispatchedAt: now },
        DELIVERED: { deliveredAt: now },
    }[nextStatus] ?? {};

    const restockable = restock?.filter((item) => item.variantId) ?? [];
    const restockRequest = restockable.length > 0
        ? Prisma.join(restockable.map((item) => Prisma.sql`(${item.variantId}::text, ${item.quantity}::int)`), ", ")
        : null;

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

        // 0 rows means another request already moved the order out of
        // `currentStatus`; the caller turns this into a 409.
        if (updated.count === 0) return null;

        await tx.orderStatusHistory.create({
            data: {
                orderId,
                status: nextStatus,
                note: note ?? null,
                changedBy: changedBy ?? null,
            },
        });

        if (restockRequest) {
            await tx.$queryRaw`
                WITH req("variantId", qty) AS (VALUES ${restockRequest})
                UPDATE product_variants v
                SET stock = v.stock + req.qty, "updated_at" = now()
                FROM req
                WHERE v.id = req."variantId"
            `;
        }

        return { id: orderId, status: nextStatus, paymentStatus };
    }, { timeout: 20000 });
};
