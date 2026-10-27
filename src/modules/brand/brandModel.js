import prisma from "../../config/dbConfig.js";
import { Prisma } from "../../../generated/prisma/index.js";


const listSelect = {
    id: true,
    name: true,
    slug: true,
    logo: true,
    isAvailable: true,
    description: true,
    seoTitle: true,
    seoImage: true,
    createdAt: true,
    _count: { select: { products: true } },
};

const detailSelect = {
    id: true,
    name: true,
    slug: true,
    logo: true,
    seoImage: true,
    isAvailable: true,
};

// P2002 = slug taken in this store
export const createBrandModel = (storeId, data) =>
    prisma.brand.create({
        data: { ...data, storeId },
        select: {
            id: true,
            name: true,
            slug: true
        },
    });

const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

export const getBrandsModel = async (storeId, { page, limit, search, isAvailable }) => {
    const like = search ? `%${escapeLike(search)}%` : null;
    const searchSql = like ? Prisma.sql`AND (b.name ILIKE ${like} OR b.slug ILIKE ${like})` : Prisma.empty;
    const availableSql = isAvailable === undefined ? Prisma.empty : Prisma.sql`AND b.is_available = ${isAvailable}`;

    const rows = await prisma.$queryRaw(Prisma.sql`
        SELECT b.id, b.name, b.slug, b.logo, b.is_available AS "isAvailable", b.created_at AS "createdAt",
               (SELECT COUNT(*)::int FROM products p WHERE p.brand_id = b.id) AS "productCount",
               COUNT(*) OVER()::int AS total
        FROM brands b
        WHERE b.store_id = ${storeId} ${availableSql} ${searchSql}
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `);

    return {
        items: rows.map(({ total: _t, ...b }) => ({ ...b, _count: { products: b.productCount } })),
        total: rows[0]?.total ?? 0,
    };
};
export const getBrandByIdModel = (storeId, brandId) =>
    prisma.brand.findUnique({
        where: { id: brandId, storeId },
        select: { ...detailSelect },
    });

// P2025 = not found, P2002 = slug taken
export const updateBrandModel = (storeId, brandId, data) =>
    prisma.brand.update({
        where: { id: brandId, storeId },
        data,
        select: {
            id: true,
            name: true,
            slug: true,
            isAvailable: true
        },
    });

export const setBrandAvailabilityModel = (storeId, brandId, isAvailable) =>
    prisma.brand.update({
        where: { id: brandId, storeId },
        data: { isAvailable },
        select: {
            id: true,
            name: true,
            slug: true,
            isAvailable: true
        },
    });

// P2025 = not found, P2003 = products still reference it
export const deleteBrandModel = (storeId, brandId) =>
    prisma.brand.delete({
        where: { id: brandId, storeId },
        select: { id: true, name: true, logo: true, seoImage: true },
    });

// Failure path only, for the error message
export const countBrandProductsModel = (brandId) =>
    prisma.product.count({ where: { brandId } });