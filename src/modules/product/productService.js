import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { deleteImagesSafely, deleteFromCloudinary, } from "../../utils/imageUpload.js";
import {
    createProduct,
    getProductById,
    getProductForUpdate,
    clearOrderItemImagesForProduct,
    listProducts,
    updateProductById,
    deleteProductById,
    getProductsByName
} from "./productModel.js";

const isUniqueViolation = (error) => error?.code === "P2002";
const isMissingRecord = (error) => error?.code === "P2025";

// Covers and gallery images are uploaded into this shop's own Cloudinary folder
// before the product row exists. Passing it as the allowed prefix means a
// cleanup can never reach an asset belonging to another shop.
const productImageFolder = (shopId) => `shops/${shopId}/products`;

const storedImageUrls = ({ image, gallery }) => [image, ...(gallery ?? [])].filter(Boolean);

// Prisma returns Decimal instances, which serialise to JSON strings
// ("1200.00"). Products are read for display, so plain numbers are cheaper for
// the client. totalStock is derived here from the variants already fetched,
// costing no extra query.
const serializeProduct = (product) => {
    const { price, discountPrice, variants, ...rest } = product;

    return {
        ...rest,
        price: Number(price),
        discountPrice: discountPrice === null ? null : Number(discountPrice),
        totalStock: variants.reduce((total, variant) => total + variant.stock, 0),
        variants,
    };
};

const createProductService = async (shop, payload) => {
    logger.info({ shopId: shop.id }, "Attempting to create product");

    const { name, description, category, status, audience, price, discountPrice, image, gallery, variants } = payload;
    let existingProductName = await getProductsByName(shop.id, name);
    if (existingProductName) {
        throw new AppError("Product name already exists", constants.Conflict);
    }

    let product;
    try {
        product = await createProduct({
            shopId: shop.id,
            name,
            description,
            category,
            status,
            audience,
            price,
            discountPrice,
            image,
            gallery,
            variants,
        });
    } catch (error) {
        // The client uploaded these images before calling create. If the row is
        // never written, they are unreferenced, so they are destroyed instead of
        // being left behind in Cloudinary.
        await deleteImagesSafely({
            currentUrls: storedImageUrls({ image, gallery }),
            nextUrls: [],
            allowedPrefix: productImageFolder(shop.id),
        });

        if (isUniqueViolation(error)) {
            throw new AppError("Two variants cannot share the same SKU", constants.Conflict);
        }
        throw error;
    }

    logger.info({ productId: product.id, shopId: shop.id }, "Product created successfully");

    return {
        statusCode: 201,
        message: "Product created successfully",
        data: { product: { id: product.id, name: product.name } },
    };
};

const getProductByIdService = async (shop, productId) => {
    const product = await getProductById(shop.id, productId);

    if (!product) {
        throw new AppError("Product not found", constants.NotFound);
    }

    return {
        statusCode: 200,
        message: "Product fetched successfully",
        data: { product: serializeProduct(product) },
    };
};

const listOwnerProductsService = async (shop, query) => {
    logger.info({ shopId: shop.id }, "Attempting to list owner products");
    const { page, limit, search, category, status, minPrice, maxPrice, sort } = query;

    const { products, total } = await listProducts({
        shopId: shop.id,
        page,
        limit,
        search,
        category,
        status,
        minPrice,
        maxPrice,
        sort,
    });

    logger.info({ shopId: shop.id }, "Owner products listed successfully");
    return {
        statusCode: 200,
        message: "Products fetched successfully",
        data: {
            products: products.map(serializeProduct),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1),
            },
        },
    };
};

const getPublicProductsService = async (query) => {
    logger.info("Attempting to list public products");
    const { page, limit, search, category, status, minPrice, maxPrice, sort } = query;
    const effectiveStatus = status || "ACTIVE";

    const { products, total } = await listProducts({
        shopId: null,
        page,
        limit,
        search,
        category,
        status: effectiveStatus,
        minPrice,
        maxPrice,
        sort,
    });

    logger.info("Public products listed successfully");
    return {
        statusCode: 200,
        message: "Products fetched successfully",
        data: {
            products: products.map(serializeProduct),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1),
            },
        },
    };
};

const updateProductByIdService = async (shop, productId, payload) => {
    logger.info({ productId, shopId: shop.id }, "Attempting to update product");

    const existing = await getProductForUpdate(shop.id, productId);
    if (!existing) {
        throw new AppError("Product not found", constants.NotFound);
    }
    if (payload.name) {
        let existingProductName = await getProductsByName(shop.id, payload.name, productId);
        if (existingProductName) {
            throw new AppError("Product name already exists", constants.Conflict);
        }
    }

    const effectivePrice = payload.price !== undefined ? payload.price : Number(existing.price);

    const effectiveDiscount = payload.discountPrice !== undefined
        ? payload.discountPrice
        : (existing.discountPrice === null ? null : Number(existing.discountPrice));

    if (effectiveDiscount != null && effectiveDiscount > effectivePrice) {
        throw new AppError("Discount price cannot be greater than price", constants.BadRequest);
    }

    if (payload.image === null && existing.image != null) {
        await deleteFromCloudinary(existing.image);
    }

    if (payload.gallery && Array.isArray(payload.gallery)) {
        // Clean up gallery images that are being removed
        const existingUrls = existing.gallery || [];
        const nextUrls = payload.gallery;
        await deleteImagesSafely({
            currentUrls: existingUrls,
            nextUrls: nextUrls,
            allowedPrefix: productImageFolder(shop.id),
        });
    }

    let product;
    try {
        product = await updateProductById(productId, payload);
    } catch (error) {
        if (isUniqueViolation(error)) {
            throw new AppError("Two variants cannot share the same SKU", constants.Conflict);
        }
        if (isMissingRecord(error)) {
            throw new AppError("Product not found", constants.NotFound);
        }
        throw error;
    }

    // Deleting the cover outright means the order snapshots that reference it
    // become dead URLs, so they are cleared in the same flow.
    if (payload.image === null) {
        await clearOrderItemImagesForProduct(productId);
    }

    // Whatever the update stopped referencing (replaced cover, shortened
    // gallery) is destroyed from Cloudinary. Omitted fields keep their stored
    // value, so they are included in `nextUrls` and therefore never deleted.
    await deleteImagesSafely({
        currentUrls: storedImageUrls(existing),
        nextUrls: [
            payload.image !== undefined ? product.image : existing.image,
            ...(payload.gallery !== undefined ? product.gallery : existing.gallery),
        ].filter(Boolean),
        allowedPrefix: productImageFolder(shop.id),
    });

    logger.info({ productId: product.id }, "Product updated successfully");

    return {
        statusCode: 200,
        message: "Product updated successfully",
        data: { product: serializeProduct(product) },
    };
};

const deleteProductByIdService = async (shop, productId) => {
    logger.info({ productId, shopId: shop.id }, "Attempting to delete product");

    const existing = await getProductForUpdate(shop.id, productId);
    if (!existing) {
        throw new AppError("Product not found", constants.NotFound);
    }

    // Order items survive the product (onDelete: SetNull) but their image
    // snapshot pointed at an asset that no longer exists. This has to run
    // BEFORE the delete: once the product row is gone the database nulls
    // order_items.product_id, and the `productId` filter would match nothing.
    await clearOrderItemImagesForProduct(productId);

    let deleted;
    try {
        deleted = await deleteProductById(shop.id, productId);
    } catch (error) {
        if (isMissingRecord(error)) {
            throw new AppError("Product not found", constants.NotFound);
        }
        throw error;
    }

    if (!deleted) {
        throw new AppError("Product not found", constants.NotFound);
    }

    await deleteImagesSafely({
        currentUrls: storedImageUrls(existing),
        nextUrls: [],
        allowedPrefix: productImageFolder(shop.id),
    });

    logger.info({ productId }, "Product deleted successfully");

    return {
        statusCode: 200,
        message: "Product deleted successfully",
        data: { id: productId },
    };
};

export {
    createProductService,
    getProductByIdService,
    listOwnerProductsService,
    getPublicProductsService,
    updateProductByIdService,
    deleteProductByIdService,
};
