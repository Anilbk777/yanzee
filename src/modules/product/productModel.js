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
    audience: true,
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
            audience: data.audience,
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
    });
};

export const getProductById = async (shopId, productId) => {
    const product = await prisma.product.findFirst({
        where: { id: productId, shopId },
        select: DETAIL_SELECT,
    });

    if (!product) return null;

    return {
        ...product,
        price: product.price ? product.price.toString() : null,
        discountPrice: product.discountPrice ? product.discountPrice.toString() : null,
        totalStock: product.variants.reduce((total, variant) => total + variant.stock, 0),
    };
};

// Everything the update/delete flows need from the existing row in ONE
// relation-free read: the money fields for validation, and the stored image
// URLs so the Cloudinary assets being dropped can be identified. Scoped by
// shopId, so ownership is enforced by the query itself.
export const getProductForUpdate = async (shopId, productId) => {
    return await prisma.product.findFirst({
        where: { id: productId, shopId },
        select: { id: true, price: true, discountPrice: true, image: true, gallery: true },
    });
};

// Order items hold a SNAPSHOT of the product image taken at purchase time. Once
// the underlying asset is destroyed that snapshot URL is dead, so it is nulled
// in the same flow that removes the image.
export const clearOrderItemImagesForProduct = async (productId) => {
    return await prisma.orderItem.updateMany({
        where: { productId },
        data: { image: null },
    });
};

export const listProducts = async ({ shopId, page, limit, search, category, status, minPrice, maxPrice, sort }) => {
    const priceFilter = {};
    if (minPrice !== undefined && minPrice !== null) {
        priceFilter.gte = minPrice;
    }
    if (maxPrice !== undefined && maxPrice !== null) {
        priceFilter.lte = maxPrice;
    }

    const where = {
        ...(shopId ? { shopId } : {}),
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
        ...(Object.keys(priceFilter).length > 0 ? { price: priceFilter } : {}),
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
                audience: true,
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

    // The variants are replaced wholesale, so the response has to be re-read
    // with the same select the detail endpoint uses. Returning the bare update
    // result left `variants` undefined, which crashed the serializer in the
    // service on every PATCH.
    return await prisma.product.update({
        where: { id: productId },
        data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.description !== undefined ? { description: toNull(data.description) } : {}),
            ...(data.category !== undefined ? { category: data.category } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
            ...(data.audience !== undefined ? { audience: data.audience } : {}),
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

export const getProductsByName = async (shopId, name, excludeProductId = null) => {
    return await prisma.product.findFirst({
        where: {
            shopId,
            name: { equals: name, mode: "insensitive" },
            // Prisma rejects a null filter value, so the exclusion is only
            // applied on an update, where the product itself must not match.
            ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
        },
        select: { id: true, name: true },
    });
};