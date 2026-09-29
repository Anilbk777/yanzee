import prisma from "../../config/dbConfig.js";

const toNull = (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = typeof value === "string" ? value.trim() : value;
    return trimmed === "" ? null : trimmed;
};

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

const SORT_MAPPING = {
    newest: { createdAt: "desc" },
    oldest: { createdAt: "asc" },
    price_asc: { price: "asc" },
    price_desc: { price: "desc" },
    name_asc: { name: "asc" },
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
    const product = await prisma.product.findFirst({
        where: { id: productId, shopId },
        select: {
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
        },
    });

    if (!product) return null;

    return {
        ...product,
        price: product.price ? product.price.toString() : null,
        discountPrice: product.discountPrice ? product.discountPrice.toString() : null,
        totalStock: product.variants.reduce((total, variant) => total + variant.stock, 0),
    };
};

export const getProductPricing = async (shopId, productId) => {
    return await prisma.product.findFirst({
        where: { id: productId, shopId },
        select: { id: true, price: true, discountPrice: true },
    });
};

export const listProducts = async ({ shopId, page, limit, search, category, status, sort }) => {
    const where = {
        shopId,
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    };

    const orderBy = SORT_MAPPING[sort] ?? SORT_MAPPING.newest;

    const [products, total] = await Promise.all([
        prisma.product.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                shopId: true,
                name: true,
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
                    },
                    orderBy: { size: "asc" },
                },
            },
        }),
        prisma.product.count({ where }),
    ]);

    const formattedProducts = products.map((product) => ({
        ...product,
        price: product.price ? product.price.toString() : null,
        discountPrice: product.discountPrice ? product.discountPrice.toString() : null,
        totalStock: product.variants.reduce((total, variant) => total + variant.stock, 0),
    }));

    return { products: formattedProducts, total };
};

export const updateProductById = async (productId, data) => {
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

export const getProductsByName = async (shopId, name) => {
    return await prisma.product.findFirst({
        where: { shopId, name },
        select: { id: true, name: true },
    });
};