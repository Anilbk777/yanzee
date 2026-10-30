import prisma from "../../config/dbConfig.js";
import { Prisma } from "../../../generated/prisma/index.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import { createInitialInventory, removeStock } from "../inventory/inventoryHelper.js";
const connectIds = (ids) => ids.map((id) => ({ id }));

// ---------- selects ----------
const variantSelect = {
    id: true, name: true, size: true, colorCodes: true,
    crossedPrice: true, sellingPrice: true, costPrice: true,
    quantity: true, weight: true, sku: true, hsCode: true, altBarcode: true,
    isAvailable:true, imageUrls:true,
    createdAt: true, updatedAt: true,
};

// Variant products have no price/stock of their own, so the list reads them from the variants
const listSelect = {
    id: true, name: true, slug: true, status: true, channel: true, audience: true,
    isAvailable: true, hasVariants: true, sellingPrice: true, crossedPrice: true,
    quantity: true, imageUrls: true, createdAt: true, stockStatus: true,
    brand: { select: { id: true, name: true } },
    variants: { select: { sellingPrice: true, quantity: true, stockStatus: true } },
};

const detailSelect = {
    id: true, name: true, slug: true, productDescription: true, longDescription: true,
    audience: true, status: true, channel: true, isAvailable: true, hasVariants: true,
    crossedPrice: true, sellingPrice: true, costPrice: true, quantity: true, weight: true,
    sku: true, hsCode: true, altBarcode: true,
    imageUrls: true, tags: true, releaseDate: true,
    seoTitle: true, seoDescription: true, seoImage: true,
    ratingAvg: true, ratingCount: true, createdAt: true, updatedAt: true,
    brand: { select: { id: true, name: true, slug: true } },
    categories: { select: { id: true, name: true, slug: true } },
    similarProducts: { select: { id: true, name: true, slug: true, sellingPrice: true, imageUrls: true, status: true } },
    variants: { select: variantSelect, orderBy: { createdAt: "asc" } },
};

// ---------- reference checks (tenant safety) ----------
export const countStoreCategoriesModel = (storeId, ids) =>
    prisma.category.count({ where: { storeId, id: { in: ids } } });

export const countStoreProductsModel = (storeId, ids) =>
    prisma.product.count({ where: { storeId, id: { in: ids } } });

export const brandExistsModel = async (storeId, brandId) =>
    (await prisma.brand.count({ where: { id: brandId, storeId } })) > 0;

// SKUs already used in this store by products or variants.
// `productId` excludes the product being edited and all of its variants.
export const findTakenSkusModel = async (storeId, skus, { productId } = {}) => {
    if (skus.length === 0) return [];

    const [products, variants] = await Promise.all([
        prisma.product.findMany({
            where: { storeId, sku: { in: skus }, ...(productId && { id: { not: productId } }) },
            select: { sku: true },
        }),
        prisma.productVariant.findMany({
            where: { storeId, sku: { in: skus }, ...(productId && { productId: { not: productId } }) },
            select: { sku: true },
        }),
    ]);

    return [...new Set([...products, ...variants].map((r) => r.sku))];
};

// ---------- create ----------
// P2002 = slug or sku already taken
export const createProductModel = async (
    userId,
    storeId,
    { outletId, categoryIds, similarProductIds, variants, brandId, ...data }
) => {
    return prisma.$transaction(async (tx) => {
        // The outlet the user chose, or the main outlet when none was sent
        const outlet = await tx.outlet.findFirst({
            where: outletId
                ? { id: outletId, storeId }
                : { storeId, isMain: true, isActive: true },
        });

        if (!outlet) {
            throw outletId
                ? new AppError("Outlet not found", constants.NotFound)
                : new AppError("Main outlet not found for this store", constants.BadRequest);
        }
        if (!outlet.isActive) {
            throw new AppError("This outlet is turned off. Turn it on before adding stock", constants.Conflict);
        }

        const hasVariants = variants.length > 0;

        const product = await tx.product.create({
            data: {
                ...data,
                store: { connect: { id: storeId } },
                ...(brandId && { brand: { connect: { id: brandId } } }),
                hasVariants,
                ...(!hasVariants && { quantity: data.quantity ?? 0 }),
                categories: { connect: connectIds(categoryIds) },
                ...(similarProductIds.length > 0 && {
                    similarProducts: { connect: connectIds(similarProductIds) },
                }),
                ...(hasVariants && { variants: { create: variants } }), // imageUrls + isAvailable pass through as scalars
            },
            include: { variants: true },
        });

        await createInitialInventory(tx, {
            userId, storeId, outlet, product, variants: product.variants,
        });

        return { id: product.id, name: product.name, slug: product.slug };
    }, { timeout: 15000 });
};

// ---------- read ----------
export const getProductsModel = async (storeId, { page, limit, search, status, channel, audience, brandId, categoryId, isAvailable }) => {
    const where = {
        storeId,
        ...(status && { status }),
        ...(channel && { channel }),
        ...(audience && { audience }),
        ...(brandId && { brandId }),
        ...(categoryId && { categories: { some: { id: categoryId } } }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(search && {
            OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
            ],
        }),
    };

    // Two independent reads, so run them on separate connections at the same time
    const [items, total] = await Promise.all([
        prisma.product.findMany({
            where,
            select: listSelect,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.product.count({ where }),
    ]);

    return { items, total };
};

export const getProductByIdModel = (storeId, productId) =>
    prisma.product.findUnique({ where: { id: productId, storeId }, select: detailSelect });

// Light read before an update; each caller selects only what it needs
export const getProductSnapshotModel = (storeId, productId, select) =>
    prisma.product.findUnique({ where: { id: productId, storeId }, select });

// ---------- update ----------
// Used by general, custom, status and SEO. P2025 = not found, P2002 = slug taken
export const updateProductModel = (storeId, productId, { categoryIds, similarProductIds, ...data }) =>
    prisma.product.update({
        where: { id: productId, storeId },
        data: {
            ...data, // undefined fields are skipped by Prisma
            ...(categoryIds && { categories: { set: connectIds(categoryIds) } }),
            ...(similarProductIds && { similarProducts: { set: connectIds(similarProductIds) } }),
        },
        select: {
            id: true, name: true, slug: true,
        },
    });

const OPEN_ORDER = ["PENDING", "PROCESSING", "DISPATCHED"];

export const updateInventoryModel = async (userId, storeId, productId, { variants, writeOffBase, ...data }) => {
    return prisma.$transaction(async (tx) => {
        // case 3: base -> variants
        if (writeOffBase) {
            await removeStock(tx, { storeId, productId, variantIds: null, userId, note: "Product converted to variants"});
        }

        if (variants) {
            const keepIds = variants.filter((v) => v.id).map((v) => v.id);

            // cases 2 and 4: variants missing from the list are removed
            const removed = await tx.productVariant.findMany({
                where: { productId, storeId, id: { notIn: keepIds } }, // notIn: [] matches all
                select: { id: true, name: true },
            });

            if (removed.length > 0) {
                const removedIds = removed.map((v) => v.id);

                const open = await tx.orderItem.findFirst({
                    where: { variantId: { in: removedIds }, order: { status: { in: OPEN_ORDER } } },
                    select: { variantName: true, order: { select: { orderNumber: true } } },
                });
                if (open) {
                    throw new AppError(
                        `"${open.variantName}" is in open order #${open.order.orderNumber}. Finish or cancel it before removing the variant`,
                        constants.Conflict
                    );
                }

                await removeStock(tx, { storeId, productId, variantIds: removedIds, userId, note: "Variant removed from product"});
            }

            // changed variants
            for (const { id, data: variantData } of variants) {
                if (id) await tx.productVariant.update({ where: { id, productId, storeId }, data: variantData });
            }

            // new variants: quantity 0, no batch. Stock comes from stock-in.
            const toCreate = variants.filter((v) => !v.id).map((v) => ({ ...v.data, productId, storeId }));
            if (toCreate.length > 0) await tx.productVariant.createMany({ data: toCreate });
        }

        return tx.product.update({ where: { id: productId, storeId }, data, select: { id: true, name: true } });
    }, { timeout: 30000 });
};


// P2025 / not found is thrown as an AppError below
export const deleteProductModel = (userId, storeId, productId) =>
    prisma.$transaction(async (tx) => {
        // Read first: after the delete, the variants and their images are gone
        const product = await tx.product.findFirst({
            where: { id: productId, storeId },
            select: {
                id: true, name: true, imageUrls: true, seoImage: true,
                variants: { select: { imageUrls: true } },
            },
        });
        if (!product) throw new AppError("Product not found", constants.NotFound);

        // Orders still being fulfilled need the product
        const open = await tx.orderItem.findFirst({
            where: { productId, order: { status: { in: OPEN_ORDER } } },
            select: { order: { select: { orderNumber: true } } },
        });
        if (open) {
            throw new AppError(
                `This product is in open order #${open.order.orderNumber}. Finish or cancel it before deleting the product`,
                constants.Conflict
            );
        }

        await removeStock(tx, { storeId, productId, all: true, userId, note: "Product deleted" });

        // Cascades: variants and any remaining outlet_stocks rows
        await tx.product.delete({ where: { id: productId, storeId } });

        return {
            id: product.id,
            name: product.name,
            imageUrls: [...product.imageUrls, ...product.variants.flatMap((v) => v.imageUrls ?? [])],
            seoImage: product.seoImage,
        };
    }, { timeout: 15000 });

export const validateRefsAndSkusModel = async (storeId, { categoryIds = [], brandId = null, similarProductIds = [], skus = [], productId = null }) => {
    const [row] = await prisma.$queryRaw`
        SELECT
            (SELECT COUNT(*)::int FROM categories
                WHERE store_id = ${storeId} AND id = ANY(${categoryIds}::text[])) AS "categories",
            (SELECT COUNT(*)::int FROM brands
                WHERE store_id = ${storeId} AND id = ${brandId}::text) AS "brand",
            (SELECT COUNT(*)::int FROM products
                WHERE store_id = ${storeId} AND id = ANY(${similarProductIds}::text[])) AS "similar",
            COALESCE((
                SELECT array_agg(DISTINCT sku) FROM (
                    SELECT sku FROM products
                        WHERE store_id = ${storeId} AND sku = ANY(${skus}::text[])
                          AND (${productId}::text IS NULL OR id <> ${productId}::text)
                    UNION ALL
                    SELECT sku FROM product_variants
                        WHERE store_id = ${storeId} AND sku = ANY(${skus}::text[])
                          AND (${productId}::text IS NULL OR product_id <> ${productId}::text)
                ) t
            ), '{}') AS "takenSkus"
    `;
    return row;
};


const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

// Channel to the product channels it may sell (same rule as order creation)
const CHANNEL_PRODUCTS = { POS: ["ALL", "POS"], ADMIN: ["ALL", "WEBSITE"] };

export const getSellableItemsModel = async (
    storeId,
    { page, limit, search, outletId, categoryId, channel, includeOutOfStock }
) => {
    const like = search ? `%${escapeLike(search)}%` : null;

    // Filters that apply to the product, for both the plain products and the variants
    const channelSql = channel ? Prisma.sql`AND p.channel::text = ANY(${CHANNEL_PRODUCTS[channel]}::text[])` : Prisma.empty;
    const categorySql = categoryId
        ? Prisma.sql`AND EXISTS (
              SELECT 1 FROM "_CategoryToProduct" cp WHERE cp."B" = p.id AND cp."A" = ${categoryId}::text
          )`
        : Prisma.empty;

    // The search box: SKU, product name, variant name, or "product variant" together
    const searchSql = like
        ? Prisma.sql`AND (
              i.sku ILIKE ${like}
              OR i.product_name ILIKE ${like}
              OR i.variant_name ILIKE ${like}
              OR (i.product_name || ' ' || COALESCE(i.variant_name, '')) ILIKE ${like}
          )`
        : Prisma.empty;

    // One outlet, or every ACTIVE outlet
    const outletSql = outletId ? Prisma.sql`os.outlet_id = ${outletId}` : Prisma.sql`o.is_active`;
    const stockSql = includeOutOfStock ? Prisma.empty : Prisma.sql`AND COALESCE(s.qty, 0) > 0`;

    const rows = await prisma.$queryRaw(Prisma.sql`
        WITH
        items AS (
            SELECT p.id AS product_id, NULL::text AS variant_id, p.id AS item_key,
                   p.name AS product_name, NULL::text AS variant_name, p.sku AS sku,
                   p.selling_price AS price, p.image_urls[1] AS image
            FROM products p
            WHERE p.store_id = ${storeId} AND NOT p.has_variants
              AND p.status = 'ACTIVE' AND p.is_available ${channelSql} ${categorySql}
            UNION ALL
            SELECT p.id, v.id, v.id, p.name, v.name, v.sku, v.selling_price, p.image_urls[1]
            FROM product_variants v
            JOIN products p ON p.id = v.product_id AND p.store_id = v.store_id
            WHERE v.store_id = ${storeId} AND p.has_variants
              AND p.status = 'ACTIVE' AND p.is_available ${channelSql} ${categorySql}
        ),
        stock AS (
            SELECT os.item_key, SUM(os.quantity)::int AS qty
            FROM outlet_stocks os
            JOIN outlets o ON o.id = os.outlet_id
            WHERE os.store_id = ${storeId} AND ${outletSql}
            GROUP BY os.item_key
        )
        SELECT i.product_id AS "productId", i.variant_id AS "variantId",
               i.product_name AS "productName", i.variant_name AS "variantName",
               i.sku, i.image, i.price::text AS "unitPrice",
               COALESCE(s.qty, 0) AS quantity,
               COUNT(*) OVER()::int AS total
        FROM items i
        LEFT JOIN stock s ON s.item_key = i.item_key
        WHERE TRUE ${searchSql} ${stockSql}
        ORDER BY i.product_name, i.variant_name NULLS FIRST, i.item_key
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `);

    return { items: rows, total: rows[0]?.total ?? 0 };
};