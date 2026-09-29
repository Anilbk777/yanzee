import prisma, { Prisma } from "../../config/dbConfig.js";

// -----------------------------------------------------------------------------
// WHY RAW SQL ON THE READ PATHS
//
// The database is remote (Neon, ap-southeast-2) and every round trip measured
// ~500ms, while a query on this data executes in ~0.05ms. Latency is dominated
// by round trips, not by execution time.
//
// Prisma loads relations with a SECOND query and stitches the result in the
// client: selecting `variants` took 975ms versus 511ms for the same query
// without it. `relationLoadStrategy: "join"` is not available in Prisma 7.10
// with the pg driver adapter.
//
// So the two read paths are written as a single statement that joins
// product_variants and aggregates totalStock in place. That halves the latency
// of GET /products and GET /products/:id. Writes stay on Prisma, where the
// nested variant handling is worth more than the round trip.
// -----------------------------------------------------------------------------

// ORDER BY fragments are a fixed whitelist - never client input is
// interpolated here, only the key that selects one of these.
const SORT_CLAUSES = {
    newest: Prisma.sql`p."created_at" DESC`,
    oldest: Prisma.sql`p."created_at" ASC`,
    price_asc: Prisma.sql`p.price ASC`,
    price_desc: Prisma.sql`p.price DESC`,
    name_asc: Prisma.sql`p.name ASC`,
};

// `::text` keeps the exact decimal from the database; the service converts to
// a number for the client. Casting the column to text instead would make the
// comparison a text sort, so the sort still uses the numeric column.
const PRODUCT_COLUMNS = Prisma.sql`
    p.id,
    p."shop_id" AS "shopId",
    p.name,
    p.category,
    p.status,
    p.price::text AS price,
    p."discountPrice"::text AS "discountPrice",
    p.image,
    p.gallery,
    p."created_at" AS "createdAt",
    p."updated_at" AS "updatedAt"
`;

const LIST_VARIANTS = Prisma.sql`
    COALESCE(
        json_agg(
            json_build_object('size', v.size, 'stock', v.stock) ORDER BY v.size
        ) FILTER (WHERE v.id IS NOT NULL),
        '[]'::json
    ) AS variants,
    COALESCE(SUM(v.stock), 0)::int AS "totalStock"
`;

const DETAIL_VARIANTS = Prisma.sql`
    COALESCE(
        json_agg(
            json_build_object(
                'id', v.id,
                'size', v.size,
                'stock', v.stock,
                'sku', v.sku,
                'createdAt', v."created_at",
                'updatedAt', v."updated_at"
            ) ORDER BY v.size
        ) FILTER (WHERE v.id IS NOT NULL),
        '[]'::json
    ) AS variants,
    COALESCE(SUM(v.stock), 0)::int AS "totalStock"
`;

const toNull = (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = typeof value === "string" ? value.trim() : value;
    return trimmed === "" ? null : trimmed;
};

// Written by Prisma, so the shape is already camelCase and needs no mapping.
const DETAIL_SELECT = {
    id: true,
    shopId: true,
    name: true,
    description: true,
    category: true,
    status: true,
    price: true,
    discountPrice: true,
    image: true,
    gallery: true,
    createdAt: true,
    updatedAt: true,
    variants: {
        select: {
            id: true,
            size: true,
            stock: true,
            sku: true,
            createdAt: true,
            updatedAt: true,
        },
        orderBy: { size: "asc" },
    },
};

export const createProduct = async (data) => {
    return await prisma.product.create({
        data: {
            shopId: data.shopId,
            name: data.name,
            description: toNull(data.description),
            category: data.category,
            status: data.status,
            price: data.price,
            discountPrice: toNull(data.discountPrice),
            image: toNull(data.image),
            gallery: data.gallery ?? [],
            variants: {
                create: data.variants.map((item) => ({
                    size: item.size,
                    stock: item.stock,
                    sku: toNull(item.sku),
                })),
            },
        },
        select: DETAIL_SELECT,
    });
};

export const getProductById = async (shopId, productId) => {
    const rows = await prisma.$queryRaw`
        SELECT
            ${PRODUCT_COLUMNS},
            p.description,
            ${DETAIL_VARIANTS}
        FROM products p
        LEFT JOIN product_variants v ON v."product_id" = p.id
        WHERE p.id = ${productId} AND p."shop_id" = ${shopId}
        GROUP BY p.id
    `;

    return rows[0] ?? null;
};

// Only the two money fields, and no relation select - used as the ownership
// guard before an update, so it stays at one round trip.
export const getProductPricing = async (shopId, productId) => {
    return await prisma.product.findFirst({
        where: { id: productId, shopId },
        select: { id: true, price: true, discountPrice: true },
    });
};

// The page CTE bounds the work: only the products on the requested page have
// their variants aggregated. Without it, GROUP BY runs over every product in
// the shop before LIMIT applies, and the planner falls back to a seq scan.
// The inner ORDER BY is what the [shop_id, created_at] index serves; the outer
// one only re-sorts the (at most 50) rows already fetched.

export const listProducts = async ({ shopId, page, limit, search, category, status, sort }) => {
    const filters = [Prisma.sql`p."shop_id" = ${shopId}`];

    if (status) filters.push(Prisma.sql`p.status = ${status}::"ProductStatus"`);
    if (category) filters.push(Prisma.sql`p.category = ${category}::"ProductCategory"`);
    if (search) filters.push(Prisma.sql`p.name ILIKE ${`%${search}%`}`);

    // The count is a second round trip, but it is issued concurrently and the
    // pool overlaps it with the page query, so it costs no extra wall time.
    const where = {
        shopId,
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    };

    const [products, total] = await Promise.all([
        prisma.$queryRaw`
            WITH page AS (
                SELECT p.id
                FROM products p
                WHERE ${Prisma.join(filters, " AND ")}
                ORDER BY ${SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest}
                LIMIT ${limit} OFFSET ${(page - 1) * limit}
            )
            SELECT
                ${PRODUCT_COLUMNS},
                ${LIST_VARIANTS}
            FROM page
            JOIN products p ON p.id = page.id
            LEFT JOIN product_variants v ON v."product_id" = p.id
            GROUP BY p.id
            ORDER BY ${SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest}
        `,
        prisma.product.count({ where }),
    ]);

    return { products, total };
};

export const updateProductById = async (productId, data) => {
    // Variants are replaced wholesale when supplied. Prisma wraps nested writes
    // in a transaction, so delete + reinsert is atomic.
    const variants = Array.isArray(data.variants)
        ? {
            deleteMany: {},
            create: data.variants.map((item) => ({
                size: item.size,
                stock: item.stock,
                sku: toNull(item.sku),
            })),
        }
        : undefined;

    return await prisma.product.update({
        where: { id: productId },
        data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.description !== undefined ? { description: toNull(data.description) } : {}),
            ...(data.category !== undefined ? { category: data.category } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
            ...(data.price !== undefined ? { price: data.price } : {}),
            ...(data.discountPrice !== undefined ? { discountPrice: toNull(data.discountPrice) } : {}),
            ...(data.image !== undefined ? { image: toNull(data.image) } : {}),
            ...(data.gallery !== undefined ? { gallery: data.gallery } : {}),
            ...(variants ? { variants } : {}),
        },
        select: DETAIL_SELECT,
    });
};

export const deleteProductById = async (shopId, productId) => {
    // findFirst + delete keeps the ownership check identical to the read path;
    // a mismatched shop yields null instead of deleting someone else's product.
    const product = await prisma.product.findFirst({
        where: { id: productId, shopId },
        select: { id: true },
    });

    if (!product) return null;

    return await prisma.product.delete({
        where: { id: product.id },
        select: { id: true },
    });
};
