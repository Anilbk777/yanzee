import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import { slugify, randomSuffix } from "../../utils/slug.js";
import {planNewImage, publicIdOf, dispatchMoves, dispatchDeletes,planImageField } from "../../utils/imageUpload.js";
import { BASE_ONLY_FIELDS } from "./productValidation.js";
import {
    createProductModel, getProductsModel, getProductByIdModel, getProductSnapshotModel,
    updateProductModel, updateInventoryModel, deleteProductModel, validateRefsAndSkusModel, getSellableItemsModel
} from "./productModel.js";

const SLUG_MAX_ATTEMPTS = 3;

// ---------- error helpers ----------
const isUniqueViolation = (error) => error?.code === "P2002";
const isNotFound = (error) => error?.code === "P2025";
const isForeignKeyViolation = (error) => error?.code === "P2003";

// Which constraint failed? Check meta.target and the message, because it depends on the driver.
const isSkuViolation = (error) =>
    isUniqueViolation(error) && `${error?.meta?.target ?? ""} ${error?.message ?? ""}`.toLowerCase().includes("sku");

const mapWriteError = (error, fkMessage = "A related record no longer exists") => {
    if (isSkuViolation(error)) return new AppError("SKU already exists", constants.Conflict);
    if (isUniqueViolation(error)) return new AppError("Slug already exists. Please choose a different slug", constants.Conflict);
    if (isNotFound(error)) return new AppError("Product not found", constants.NotFound);
    if (isForeignKeyViolation(error)) return new AppError(fkMessage, constants.Conflict);
    return error;
};

// ---------- value helpers ----------
const toNumber = (v) => (v == null ? null : Number(v));

// Variant products keep price and stock on the variants, so the product's own values are null
const BASE_RESET = {
    sellingPrice: null,
    crossedPrice: null, costPrice: null, weight: null, sku: null, hsCode: null, altBarcode: null,
};

// The variant list is the full desired state, so omitted optional fields are reset
const toVariantOp = ({ id, ...v }) => ({
    id,
    data: {
        name: v.name,
        size: v.size ?? null,
        colorCodes: v.colorCodes ?? [],
        sellingPrice: v.sellingPrice,
        crossedPrice: v.crossedPrice ?? null,
        costPrice: v.costPrice ?? null,
        weight: v.weight ?? null,
        sku: v.sku ?? null,
        hsCode: v.hsCode ?? null,
        altBarcode: v.altBarcode ?? null,
    },
});

// List rows: variant products get their price range and total stock from the variants
const toListItem = ({ variants, ...product }) => {
    if (!product.hasVariants) {
        const price = toNumber(product.sellingPrice);
        return { ...product, variantCount: 0, priceMin: price, priceMax: price };
    }

    const prices = variants.map((v) => Number(v.sellingPrice));
    return {
        ...product,
        variantCount: variants.length,
        priceMin: prices.length ? Math.min(...prices) : null,
        priceMax: prices.length ? Math.max(...prices) : null,
        quantity: variants.reduce((sum, v) => sum + (v.quantity ?? 0), 0),
    };
};

const ok = (message, product) => ({ statusCode: 200, message, data: { product } });

const assertCrossedPrice = (crossed, selling) => {
    if (crossed != null && selling != null && crossed < selling) {
        throw new AppError("Crossed price must be greater than or equal to the selling price", constants.BadRequest);
    }
};
// ---------- write helpers ----------
// Runs a DB write and maps Prisma errors to AppErrors
const guarded = async (write, { fkMessage } = {}) => {
    try {
        return await write();
    } catch (error) {
        throw mapWriteError(error, fkMessage);
    }
};

const loadProduct = async (storeId, productId, select) => {
    const product = await getProductSnapshotModel(storeId, productId, select);
    if (!product) throw new AppError("Product not found", constants.NotFound);
    return product;
};

const checkRefs = async (storeId, { categoryIds, brandId, similarProductIds = [], skus = [], productId }) => {
    if (productId && similarProductIds.includes(productId)) {
        throw new AppError("A product can't be similar to itself", constants.BadRequest);
    }

    const r = await validateRefsAndSkusModel(storeId, {
        categoryIds, brandId, similarProductIds, productId,
        skus: skus.filter(Boolean),
    });

    if (categoryIds && r.categories !== categoryIds.length) throw new AppError("One or more categories are invalid", constants.BadRequest);
    if (brandId && r.brand === 0) throw new AppError("Brand not found", constants.BadRequest);
    if (r.similar !== similarProductIds.length) throw new AppError("One or more similar products are invalid", constants.BadRequest);
    if (r.takenSkus.length > 0) throw new AppError(`SKU already exists: ${r.takenSkus.join(", ")}`, constants.Conflict);
};

// ====================== CREATE ======================
export const createProductService = async (userId, storeId, payload) => {
    const { variants = [], categoryIds, similarProductIds = [], imageUrls, ...rest } = payload;
    logger.info({ storeId, outletId: rest.outletId }, "Attempting to create product");

    // One plan per distinct URL (the same image may be used by the product and by variants)
    const planCache = new Map();
    const plan = (url) => {
        if (!planCache.has(url)) planCache.set(url, planNewImage(url, storeId, "products"));
        return planCache.get(url);
    };

    const productPlans = imageUrls.map(plan);
    const variantPlans = variants.map((v) => (v.imageUrls ?? []).map(plan));
    const moves = [...planCache.values()].map((p) => p.move);

    await checkRefs(storeId, {
        categoryIds, brandId: rest.brandId, similarProductIds,
        skus: [rest.sku, ...variants.map((v) => v.sku)],
    });

    const baseSlug = slugify(rest.name, { fallback: "product", maxLength: 100 });

    for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt++) {
        const slug = attempt === 1 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
        try {
            const product = await createProductModel(userId, storeId, {
                ...rest,
                slug,
                imageUrls: productPlans.map((p) => p.url),
                categoryIds,
                similarProductIds,
                variants: variants.map((v, i) => ({
                    ...v,
                    imageUrls: variantPlans[i].map((p) => p.url), // final URLs, no temp/
                })),
            });

            dispatchMoves(moves);

            logger.info({ storeId, productId: product.id }, "Product created successfully");
            return { statusCode: 201, message: "Product created successfully", data: { product } };
        } catch (error) {
            if (isSkuViolation(error)) throw new AppError("SKU already exists", constants.Conflict);
            if (!isUniqueViolation(error)) throw error;
            logger.warn({ storeId, slug, attempt }, "Product slug collision, retrying");
        }
    }

    throw new AppError("Could not generate a unique slug, please try again", constants.Conflict);
};

// ====================== READ ======================
export const getProductsService = async (storeId, query) => {
    const { items, total } = await getProductsModel(storeId, query);

    return {
        statusCode: 200,
        message: "Products fetched successfully",
        data: {
            products: items.map(toListItem),
            pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
        },
    };
};

export const getProductService = async (storeId, productId) => {
    const product = await getProductByIdModel(storeId, productId);
    if (!product) throw new AppError("Product not found", constants.NotFound);

    return { statusCode: 200, message: "Product fetched successfully", data: { product } };
};

// ====================== 1. GENERAL ======================
export const updateGeneralService = async (storeId, productId, payload) => {
    logger.info({ storeId, productId }, "Updating product general info");

    const { categoryIds, imageUrls, ...rest } = payload;

    const [existing] = await Promise.all([
        imageUrls ? loadProduct(storeId, productId, { id: true, imageUrls: true }) : null,
        checkRefs(storeId, { categoryIds, brandId: rest.brandId }),
    ]);

    let finalUrls;      // undefined = images untouched
    let moves = [];
    let removedIds = [];

    if (imageUrls) {
        const current = existing.imageUrls;
        const currentSet = new Set(current);
        const nextSet = new Set(imageUrls);

        // Case 2 and 3: URLs that aren't already on the product must be fresh temp uploads
        const plans = new Map(
            imageUrls.filter((url) => !currentSet.has(url)).map((url) => [url, planNewImage(url, storeId, "products")])
        );

        finalUrls = imageUrls.map((url) => plans.get(url)?.url ?? url); // kept URLs stay as they are
        moves = [...plans.values()].map((p) => p.move);

        // Case 1 and 3: existing URLs that are no longer in the list
        removedIds = current
            .filter((url) => !nextSet.has(url))
            .map((url) => publicIdOf(url, storeId, "products"))
            .filter(Boolean);
    }

    const product = await guarded(() =>
        updateProductModel(storeId, productId, { ...rest, categoryIds, imageUrls: finalUrls })
    );

    // DB succeeded: hand the file work to the worker and respond immediately
    dispatchMoves(moves);
    dispatchDeletes(removedIds);
    logger.info({ storeId, productId }, "Product general info updated")

    return ok("Product updated successfully", product);
};
// ====================== 2. VARIANTS AND INVENTORY ======================
export const updateInventoryService = async (userId, storeId, productId, payload) => {
    logger.info({ storeId, productId }, "Updating product inventory");

    const { isAvailable, variants, ...base } = payload;
    const toVariants = variants?.length > 0;
    const skus = toVariants ? variants.map((v) => v.sku) : [base.sku];

    // Variant images: same temp -> final flow as create. One plan per distinct URL.
    const planCache = new Map();
    const plan = (url) => {
        if (!planCache.has(url)) planCache.set(url, planNewImage(url, storeId, "products"));
        return planCache.get(url);
    };

    const [existing] = await Promise.all([
        loadProduct(storeId, productId, {
            id: true, hasVariants: true, sellingPrice: true, crossedPrice: true, variants: { select: { id: true } },
        }),
        checkRefs(storeId, { skus, productId }),
    ]);

    const toBase = variants?.length === 0 && existing.hasVariants;

    let data = { isAvailable };
    let variantOps;
    let writeOffBase = false;

    if (toVariants) {
        const knownIds = new Set(existing.variants.map((v) => v.id));
        if (variants.some((v) => v.id && !knownIds.has(v.id))) {
            throw new AppError("One or more variants don't belong to this product", constants.BadRequest);
        }
        // imageUrls undefined = leave the variant's images alone
        variantOps = variants.map(({ id, ...v }) => ({
            id,
            data: { ...v, ...(v.imageUrls && { imageUrls: v.imageUrls.map((u) => plan(u).url) }) },
        }));
        data = { ...data, hasVariants: true, ...BASE_RESET };
        writeOffBase = !existing.hasVariants; // case 3: the base stock must be written off
    } else if (toBase) {
        if (base.sellingPrice == null) {
            throw new AppError("Selling price is required when converting to a product without variants", constants.BadRequest);
        }
        assertCrossedPrice(base.crossedPrice ?? null, base.sellingPrice);

        data = {
            ...data,
            hasVariants: false,
            quantity: 0, // the stock is written off first; the base starts at 0
            sellingPrice: base.sellingPrice,
            crossedPrice: base.crossedPrice ?? null,
            costPrice: base.costPrice ?? null,
            weight: base.weight ?? null,
            sku: base.sku ?? null,
            hsCode: base.hsCode ?? null,
            altBarcode: base.altBarcode ?? null,
        };
        variantOps = []; // case 4: every variant is removed
    } else if (existing.hasVariants) {
        const blocked = BASE_ONLY_FIELDS.find((field) => base[field] != null);
        if (blocked) {
            throw new AppError(`${blocked} is set on the variants. Send the variants array to change it`, constants.BadRequest);
        }
    } else {
        if (base.sellingPrice !== undefined || base.crossedPrice !== undefined) {
            const selling = base.sellingPrice ?? toNumber(existing.sellingPrice);
            const crossed = base.crossedPrice === undefined ? toNumber(existing.crossedPrice) : base.crossedPrice;
            assertCrossedPrice(crossed, selling);
        }
        data = { ...data, ...base };
    }

    const product = await guarded(() =>
        updateInventoryModel(userId, storeId, productId, { ...data, variants: variantOps, writeOffBase })
    );

    dispatchMoves([...planCache.values()].map((p) => p.move));

    return ok("Inventory updated successfully", product);
};

// ====================== 3. CUSTOM FIELDS ======================
export const updateCustomService = async (storeId, productId, payload) => {
    logger.info({ storeId, productId }, "Updating product custom fields");

    await checkRefs(storeId, { similarProductIds: payload.similarProductIds, productId });
    // No pre-read: a missing product comes back as P2025 (404)
    const product = await guarded(() => updateProductModel(storeId, productId, payload));
    return ok("Product updated successfully", product);
};

// ====================== 4. STATUS ======================
export const updateStatusService = async (storeId, productId, { status }) => {
    logger.info({ storeId, productId, status }, "Updating product status");

    const product = await guarded(() => updateProductModel(storeId, productId, { status }));
    return ok(`Product status set to ${status}`, product);
};

// ====================== 5. SEO ======================
export const updateSeoService = async (storeId, productId, payload) => {
    logger.info({ storeId, productId }, "Updating product SEO");

    const { seoImage, ...rest } = payload;

    const existing = seoImage !== undefined
        ? await loadProduct(storeId, productId, { id: true, seoImage: true })
        : null;

    const seo = planImageField(seoImage, existing?.seoImage, storeId, "product-seo");

    const product = await guarded(() =>
        updateProductModel(storeId, productId, { ...rest, seoImage: seo.url })
    );

    dispatchMoves(seo.move ? [seo.move] : []);
    dispatchDeletes([seo.removedId]);

    return ok("Product SEO updated successfully", product);
};

// ====================== DELETE ======================
export const deleteProductService = async (userId, storeId, productId) => {
    logger.info({ storeId, productId }, "Deleting product");

    const deleted = await deleteProductModel(userId, storeId, productId);

    const ids = [
        ...new Set(deleted.imageUrls.map((url) => publicIdOf(url, storeId, "products"))),
        publicIdOf(deleted.seoImage, storeId, "product-seo"),
    ].filter(Boolean);

    dispatchDeletes(ids); // after the commit, the response doesn't wait

    logger.info({ storeId, productId }, "Product deleted successfully");
    return { statusCode: 200, message: "Product deleted successfully", data: { id: deleted.id, name: deleted.name } };
};

export const getSellableItemsService = async (storeId, query) => {
    const { items, total } = await getSellableItemsModel(storeId, query);

    return {
        statusCode: 200,
        message: "Products fetched successfully",
        data: {
            items: items.map(({ total: _total, ...i }) => ({
                productId: i.productId,
                variantId: i.variantId,
                productName: i.productName,
                variantName: i.variantName,
                name: i.variantName ? `${i.productName} — ${i.variantName}` : i.productName,
                sku: i.sku,
                image: i.image,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
            })),
            pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
        },
    };
};