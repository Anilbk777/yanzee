import prisma from "../../config/dbConfig.js";

const SHOP_SELECT = {
    id: true,
    name: true,
    image: true,
    description: true,
    contactEmail: true,
    returnPolicy: true,
    createdAt: true,
    updatedAt: true,
    owner: {
        select: {
            id: true,
            fullName: true,
            profileImg: true,
        },
    },
    _count: {
        select: {
            products: true,
        },
    },
};

export const createShop = async (data) => {
    return await prisma.shop.create({
        data,
        select: SHOP_SELECT,
    });
};

export const getShopByOwnerId = async (ownerId) => {
    return await prisma.shop.findUnique({
        where: { ownerId },
        select: SHOP_SELECT,
    });
};

export const getShopById = async (shopId) => {
    return await prisma.shop.findUnique({
        where: { id: shopId },
        select: SHOP_SELECT,
    });
};

export const updateShopById = async (shopId, data) => {
    return await prisma.shop.update({
        where: { id: shopId },
        data,
        select: SHOP_SELECT,
    });
};

export const deleteShopById = async (shopId) => {
    return await prisma.shop.delete({
        where: { id: shopId },
        select: { id: true },
    });
};

export const listShops = async ({ page, limit, search }) => {
    const where = search
        ? {
            name: {
                contains: search,
                mode: "insensitive",
            },
        }
        : {};

    const [shops, total] = await Promise.all([
        prisma.shop.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            select: SHOP_SELECT,
        }),
        prisma.shop.count({ where }),
    ]);

    return { shops, total };
};
