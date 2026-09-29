import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import {
    createProduct,
    getProductById,
    getProductPricing,
    listProducts,
    updateProductById,
    deleteProductById,
} from "./productModel.js";

const isUniqueViolation = (error) => error?.code === "P2002";
const isMissingRecord = (error) => error?.code === "P2025";

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

    const { name, description, category, status, price, discountPrice, image, gallery, variants } = payload;

    let product;
    try {
        product = await createProduct({
            shopId: shop.id,
            name,
            description,
            category,
            status,
            price,
            discountPrice,
            image,
            gallery,
            variants,
        });
    } catch (error) {
        if (isUniqueViolation(error)) {
            throw new AppError("Two variants cannot share the same SKU", constants.Conflict);
        }
        throw error;
    }

    logger.info({ productId: product.id, shopId: shop.id }, "Product created successfully");

    return {
        statusCode: 201,
        message: "Product created successfully",
        data: { product: serializeProduct(product) },
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

const listProductsService = async (shop, query) => {
    const { page, limit, search, category, status, sort } = query;
    const { products, total } = await listProducts({ shopId: shop.id, page, limit, search, category, status, sort });

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

    // Ownership guard plus the stored money fields, in a single relation-free
    // read. Fetching the full product here instead would double the round
    // trips of the whole update.
    const existing = await getProductPricing(shop.id, productId);
    if (!existing) {
        throw new AppError("Product not found", constants.NotFound);
    }

    // On a partial update the comparison has to run against the values that
    // will actually be stored, which the create-time refine cannot see. Both
    // sides fall back to the stored value when the patch omits them.
    const effectivePrice = payload.price !== undefined ? payload.price : Number(existing.price);

    const effectiveDiscount = payload.discountPrice !== undefined
        ? payload.discountPrice
        : (existing.discountPrice === null ? null : Number(existing.discountPrice));

    if (effectiveDiscount != null && effectiveDiscount > effectivePrice) {
        throw new AppError("Discount price cannot be greater than price", constants.BadRequest);
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

    logger.info({ productId: product.id }, "Product updated successfully");

    return {
        statusCode: 200,
        message: "Product updated successfully",
        data: { product: serializeProduct(product) },
    };
};

const deleteProductByIdService = async (shop, productId) => {
    logger.info({ productId, shopId: shop.id }, "Attempting to delete product");

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
    listProductsService,
    updateProductByIdService,
    deleteProductByIdService,
};
