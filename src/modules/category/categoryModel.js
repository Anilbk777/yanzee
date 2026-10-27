import prisma from "../../config/dbConfig.js";
import { Prisma } from "../../../generated/prisma/index.js";

const listSelect = {
    id: true,
    name: true,
    slug: true,
    image: true,
    isAvailable: true,
    seoTitle: true,
    seoImage: true,
    description: true,
    createdAt: true,
    _count: { select: { products: true } }, // handy for the UI and for showing if delete is possible
};

const detailSelect = {
    id: true,
    name: true,
    slug: true,
    image: true,
    description: true,
    seoTitle: true,
    seoImage: true,
    isAvailable: true,
};

export const createCategoryModel = (storeId, data) =>
    prisma.category.create({
        data: { ...data, storeId },
        select: {
            id: true,
            name: true,
            slug: true
        },
    });

// export const getCategoriesModel = async (storeId, { page, limit, search, isAvailable }) => {
//     const where = {
//         storeId,
//         ...(isAvailable !== undefined && { isAvailable }),
//         ...(search && {
//             OR: [
//                 { name: { contains: search, mode: "insensitive" } },
//                 { slug: { contains: search, mode: "insensitive" } }
//             ]
//         })
//     };

//     const [items, total] = await Promise.all([
//         prisma.category.findMany({
//             where,
//             select: listSelect,
//             orderBy: { createdAt: "desc" },
//             skip: (page - 1) * limit,
//             take: limit,
//         }),
//         prisma.category.count({ where }),
//     ]);

//     return { items, total };
// };

const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

export const getCategoriesModel = async (storeId, { page, limit, search, isAvailable }) => {
    const like = search ? `%${escapeLike(search)}%` : null;
    const searchSql = like ? Prisma.sql`AND (c.name ILIKE ${like} OR c.slug ILIKE ${like})` : Prisma.empty;
    const availableSql = isAvailable === undefined ? Prisma.empty : Prisma.sql`AND c.is_available = ${isAvailable}`;

    const rows = await prisma.$queryRaw(Prisma.sql`
        SELECT c.id, c.name, c.slug, c.image, c.is_available AS "isAvailable", c.created_at AS "createdAt",
               (SELECT COUNT(*)::int FROM "_CategoryToProduct" cp WHERE cp."A" = c.id) AS "productCount",
               COUNT(*) OVER()::int AS total
        FROM categories c
        WHERE c.store_id = ${storeId} ${availableSql} ${searchSql}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `);

    return {
        items: rows.map(({ total: _t, ...c }) => ({ ...c, _count: { products: c.productCount } })),
        total: rows[0]?.total ?? 0,
    };
};

export const getCategoryByIdModel = (storeId, categoryId) =>
    prisma.category.findUnique({
        where: { id: categoryId, storeId },
        select: { ...detailSelect },
    });

// Throws P2025 when not found, P2002 when the slug is taken
export const updateCategoryModel = (storeId, categoryId, data) =>
    prisma.category.update({
        where: { id: categoryId, storeId },
        data,
        select: {
            id: true,
            name: true,
            slug: true
        },
    });

export const setCategoryAvailabilityModel = (storeId, categoryId, isAvailable) =>
    prisma.category.update({
        where: { id: categoryId, storeId },
        data: { isAvailable },
        select: {
            id: true,
            name: true,
            slug: true,
            isAvailable: true
        },
    });

// Throws P2025 when not found, P2003 when products still reference it
export const deleteCategoryModel = (storeId, categoryId) =>
    prisma.category.delete({
        where: { id: categoryId, storeId },
        select: { id: true, name: true, image: true, seoImage: true },
    });

// Failure path only, used to build the error message
export const countCategoryProductsModel = (categoryId) =>
    prisma.product.count({ where: { categoryId } });

export const getCategoryWithImagesModel = (storeId, categoryId) =>
    prisma.category.findUnique({
        where: { id: categoryId, storeId },
        select: {
            id: true,
            image: true,
            seoImage: true
        },
    });