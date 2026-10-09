import prisma from "../../config/dbConfig.js";

const connectIds = (ids) => ids.map((id) => ({ id }));

// ---------- selects ----------
const variantSelect = {
    id: true, name: true, size: true, colorCodes: true,
    crossedPrice: true, sellingPrice: true, costPrice: true,
    quantity: true, weight: true, sku: true, hsCode: true, altBarcode: true,
    createdAt: true, updatedAt: true,
};

// Variant products have no price/stock of their own, so the list reads them from the variants
const listSelect = {
    id: true, name: true, slug: true, status: true, channel: true, audience: true,
    isAvailable: true, hasVariants: true, sellingPrice: true, crossedPrice: true,
    quantity: true, imageUrls: true, createdAt: true,
    brand: { select: { id: true, name: true } },
    variants: { select: { sellingPrice: true, quantity: true } },
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
export const createProductModel = (storeId, { categoryIds, similarProductIds, variants, ...data }) => {
    const hasVariants = variants.length > 0;

    return prisma.product.create({
        data: {
            ...data,
            storeId,
            hasVariants,
            quantity: hasVariants ? null : data.quantity ?? 0,
            categories: { connect: connectIds(categoryIds) },
            ...(similarProductIds.length > 0 && { similarProducts: { connect: connectIds(similarProductIds) } }),
            ...(hasVariants && { variants: { create: variants } }), // storeId comes from the parent
        },
        select: {
            id: true,
            name: true,
            slug: true
        },
    });
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

// `variants` is undefined (leave alone) or [{ id?, data }] (the full desired list).
// Everything runs as ONE batched transaction (a single round trip, no interactive-transaction timeout).
// P2002 = sku taken, P2003 = a variant being deleted is used in orders
export const updateInventoryModel = async (storeId, productId, { variants, ...data }) => {
    const ops = [];

    if (variants) {
        const keepIds = variants.filter((v) => v.id).map((v) => v.id);
        const toCreate = variants.filter((v) => !v.id).map((v) => ({ ...v.data, productId, storeId }));

        // notIn: [] matches every variant, which is what "variants: []" needs
        ops.push(prisma.productVariant.deleteMany({ where: { productId, storeId, id: { notIn: keepIds } } }));

        for (const { id, data: variantData } of variants) {
            if (id) ops.push(prisma.productVariant.update({ where: { id, productId, storeId }, data: variantData }));
        }
        if (toCreate.length > 0) ops.push(prisma.productVariant.createMany({ data: toCreate }));
    }

    // Last, so the returned product already reflects the variant changes
    ops.push(prisma.product.update({ where: { id: productId, storeId }, data, select: { id: true, name: true } }));

    const results = await prisma.$transaction(ops);
    return results.at(-1);
};

// ---------- delete ----------
// P2025 = not found, P2003 = referenced by order items (depends on the OrderItem onDelete rule)
export const deleteProductModel = (storeId, productId) =>
    prisma.product.delete({
        where: { id: productId, storeId },
        select: { id: true, name: true, imageUrls: true, seoImage: true },
    });


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