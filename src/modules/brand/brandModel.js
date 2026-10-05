import prisma from "../../config/dbConfig.js";

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

export const getBrandsModel = async (storeId, { page, limit, search, isAvailable }) => {
    const where = {
        storeId,
        ...(isAvailable !== undefined && { isAvailable }),
        ...(search && {
            OR: [
                { name: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } }
            ]
        })
    };

    const [items, total] = await Promise.all([
        prisma.brand.findMany({
            where,
            select: listSelect,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.brand.count({ where }),
    ]);

    return { items, total };
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