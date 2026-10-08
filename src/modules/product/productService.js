import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import { slugify, randomSuffix } from "../../utils/slug.js";
import { claimImage, revertImage, deleteImageByUrl, prepareImage,planNewImage } from "../../utils/imageUpload.js";
import { BASE_ONLY_FIELDS } from "./productValidation.js";
import {
    countStoreCategoriesModel, countStoreProductsModel, brandExistsModel, findTakenSkusModel,
    createProductModel, getProductsModel, getProductByIdModel, getProductSnapshotModel,
    updateProductModel, updateInventoryModel, deleteProductModel,validateRefsAndSkusModel
} from "./productModel.js";
import { enqueueMoves, logQueueFailure } from "../../jobs/queue/imageQueue.js";


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

const VARIANT_IN_ORDERS =
    "Some variants are part of existing orders and can't be removed. Keep them in the list and set their quantity to 0 instead.";

// ---------- value helpers ----------
const toNumber = (v) => (v == null ? null : Number(v));

// Variant products keep price and stock on the variants, so the product's own values are null
const BASE_RESET = {
    sellingPrice: null, quantity: null,
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
        quantity: v.quantity ?? 0,
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

// ---------- validation helpers ----------
// All checks hit the database independently, so they run at the same time
const assertStoreRefs = async (storeId, { categoryIds, brandId, similarProductIds, productId }) => {
    if (productId && similarProductIds?.includes(productId)) {
        throw new AppError("A product can't be similar to itself", constants.BadRequest);
    }
    logger.info(".Asserting store refs")

    const [categoryCount, brandOk, similarCount] = await Promise.all([
        categoryIds ? countStoreCategoriesModel(storeId, categoryIds) : null,
        brandId ? brandExistsModel(storeId, brandId) : null,
        similarProductIds?.length ? countStoreProductsModel(storeId, similarProductIds) : null,
    ]);

    if (categoryCount !== null && categoryCount !== categoryIds.length) {
        throw new AppError("One or more categories are invalid", constants.BadRequest);
    }
    if (brandId && !brandOk) throw new AppError("Brand not found", constants.BadRequest);
    if (similarCount !== null && similarCount !== similarProductIds.length) {
        throw new AppError("One or more similar products are invalid", constants.BadRequest);
    }
    logger.info("Asserting store refs passed")
};

const assertSkusFree = async (storeId, skus, exclude) => {
    logger.info("Asserting skus free")
    const taken = await findTakenSkusModel(storeId, skus.filter(Boolean), exclude);
    if (taken.length > 0) throw new AppError(`SKU already exists: ${taken.join(", ")}`, constants.Conflict);
};

const assertCrossedPrice = (crossed, selling) => {
    if (crossed != null && selling != null && crossed < selling) {
        throw new AppError("Crossed price must be greater than or equal to the selling price", constants.BadRequest);
    }
};

// ---------- image helpers ----------
const revertAll = (files) => Promise.all(files.map((file) => revertImage(file)));

// Claims every temp image in parallel. If any fails, the ones already moved are put back.
const claimImages = async (urls, storeId) => {
    const results = await Promise.allSettled(urls.map((url) => claimImage(url, storeId, "products")));
    const failed = results.find((r) => r.status === "rejected");

    if (failed) {
        await revertAll(results.filter((r) => r.status === "fulfilled").map((r) => r.value));
        throw failed.reason;
    }
    return results.map((r) => r.value);
};

// Keeps existing URLs, claims new temp ones, reports which ones were removed
const planImages = async (urls, current, storeId) => {
    if (!urls) return { finalUrls: undefined, newFiles: [], removedUrls: [] };

    const fresh = urls.filter((url) => !current.includes(url));
    const newFiles = await claimImages(fresh, storeId);
    const claimed = new Map(fresh.map((url, i) => [url, newFiles[i].url]));

    return {
        finalUrls: urls.map((url) => claimed.get(url) ?? url),
        newFiles,
        removedUrls: current.filter((url) => !urls.includes(url)),
    };
};

// ---------- write helpers ----------
// Runs a DB write; on failure puts claimed images back in temp/ and maps the error
const guarded = async (write, { files = [], fkMessage } = {}) => {
    try {
        return await write();
    } catch (error) {
        await revertAll(files);
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

// Queue the moves. If Redis is down, run them in-process so the files still get moved.
const dispatchMoves = (moves) => {
    if (moves.length === 0) return;
    enqueueMoves(moves).catch((err) => {
        logQueueFailure(err, "move");
        Promise.all(moves.map(moveImage)).catch((e) => logger.error({ err: e }, "Inline move failed"));
    });
};
// ====================== CREATE ======================

export const createProductService = async (storeId, payload) => {
    const { variants = [], categoryIds, similarProductIds = [], imageUrls, ...rest } = payload;
    logger.info({ storeId }, "Attempting to create product");

    // Instant string work, no network. Throws a 400 before any DB call if a URL is invalid.
    const plans = imageUrls.map((url) => planNewImage(url, storeId, "products"));
    const moves = plans.map((p) => p.move);

    await checkRefs(storeId, {
        categoryIds, brandId: rest.brandId, similarProductIds,
        skus: [rest.sku, ...variants.map((v) => v.sku)],
    });

    const baseSlug = slugify(rest.name, { fallback: "product", maxLength: 100 });

    for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt++) {
        const slug = attempt === 1 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
        try {
            const product = await createProductModel(storeId, {
                ...rest,
                slug,
                imageUrls: plans.map((p) => p.url), // final URLs (no temp/) go straight into the DB
                categoryIds,
                similarProductIds,
                variants,
            });

            dispatchMoves(moves); // fire and forget, the response doesn't wait for Cloudinary

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

    // The product is only read when images change. Otherwise the update itself returns P2025 (404).
    const [existing] = await Promise.all([
        imageUrls ? loadProduct(storeId, productId, { id: true, imageUrls: true }) : null,
        assertStoreRefs(storeId, { categoryIds, brandId: rest.brandId }),
    ]);

    const { finalUrls, newFiles, removedUrls } = await planImages(imageUrls, existing?.imageUrls ?? [], storeId);

    const product = await guarded(
        () => updateProductModel(storeId, productId, { ...rest, categoryIds, imageUrls: finalUrls }),
        { files: newFiles }
    );

    // DB succeeded, so delete removed files (outside guarded, so it can never trigger a revert)
    await Promise.all(removedUrls.map((url) => deleteImageByUrl(url, storeId, "products")));

    return ok("Product updated successfully", product);
};

// ====================== 2. VARIANTS AND INVENTORY ======================
export const updateInventoryService = async (storeId, productId, payload) => {
    logger.info({ storeId, productId }, "Updating product inventory");

    const { isAvailable, variants, ...base } = payload;
    const toVariants = variants?.length > 0;
    const skus = toVariants ? variants.map((v) => v.sku) : [base.sku];

    // The product read and the SKU check don't depend on each other
    const [existing] = await Promise.all([
        loadProduct(storeId, productId, {
            id: true, hasVariants: true, sellingPrice: true, crossedPrice: true, variants: { select: { id: true } },
        }),
        assertSkusFree(storeId, skus, { productId }),
    ]);

    const toBase = variants?.length === 0 && existing.hasVariants;

    let data = { isAvailable }; // undefined = unchanged
    let variantOps;             // undefined = leave variants alone

    if (toVariants) {
        // base -> variants, or a sync of the existing variants
        const knownIds = new Set(existing.variants.map((v) => v.id));
        if (variants.some((v) => v.id && !knownIds.has(v.id))) {
            throw new AppError("One or more variants don't belong to this product", constants.BadRequest);
        }
        data = { ...data, hasVariants: true, ...BASE_RESET };
        variantOps = variants.map(toVariantOp);
    } else if (toBase) {
        // variants -> base: the request is the full base state
        if (base.sellingPrice == null) {
            throw new AppError("Selling price is required when converting to a product without variants", constants.BadRequest);
        }
        assertCrossedPrice(base.crossedPrice ?? null, base.sellingPrice);

        data = {
            ...data,
            hasVariants: false,
            sellingPrice: base.sellingPrice,
            crossedPrice: base.crossedPrice ?? null,
            costPrice: base.costPrice ?? null,
            quantity: base.quantity ?? 0,
            weight: base.weight ?? null,
            sku: base.sku ?? null,
            hsCode: base.hsCode ?? null,
            altBarcode: base.altBarcode ?? null,
        };
        variantOps = [];
    } else if (existing.hasVariants) {
        const blocked = BASE_ONLY_FIELDS.find((field) => base[field] != null);
        if (blocked) {
            throw new AppError(`${blocked} is set on the variants. Send the variants array to change it`, constants.BadRequest);
        }
    } else {
        // plain base product edit: compare against stored prices when only one is sent
        if (base.sellingPrice !== undefined || base.crossedPrice !== undefined) {
            const selling = base.sellingPrice ?? toNumber(existing.sellingPrice);
            const crossed = base.crossedPrice === undefined ? toNumber(existing.crossedPrice) : base.crossedPrice;
            assertCrossedPrice(crossed, selling);
        }
        data = { ...data, ...base };
    }

    const product = await guarded(
        () => updateInventoryModel(storeId, productId, { ...data, variants: variantOps }),
        { fkMessage: VARIANT_IN_ORDERS }
    );

    return ok("Inventory updated successfully", product);
};

// ====================== 3. CUSTOM FIELDS ======================
export const updateCustomService = async (storeId, productId, payload) => {
    logger.info({ storeId, productId }, "Updating product custom fields");

    await assertStoreRefs(storeId, { similarProductIds: payload.similarProductIds, productId });

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

    // The current image is only needed when the SEO image is part of the request
    const existing = seoImage !== undefined ? await loadProduct(storeId, productId, { id: true, seoImage: true }) : null;

    // undefined = unchanged, null = remove, string = replace
    const img = await prepareImage(seoImage, existing?.seoImage, storeId, "seo");

    const product = await guarded(
        () => updateProductModel(storeId, productId, { ...rest, seoImage: img.url }),
        { files: [img.file] }
    );

    if (img.url !== undefined && existing?.seoImage) await deleteImageByUrl(existing.seoImage, storeId, "seo");

    return ok("Product SEO updated successfully", product);
};

// ====================== DELETE ======================
export const deleteProductService = async (storeId, productId) => {
    logger.info({ storeId, productId }, "Deleting product");

    const deleted = await guarded(() => deleteProductModel(storeId, productId), {
        fkMessage: "This product can't be deleted because it is part of existing orders. Set its status to ARCHIVED instead.",
    });

    // DB delete succeeded, so remove every file in parallel
    await Promise.all([
        ...deleted.imageUrls.map((url) => deleteImageByUrl(url, storeId, "products")),
        deleteImageByUrl(deleted.seoImage, storeId, "seo"),
    ]);

    logger.info({ storeId, productId }, "Product deleted successfully");
    return { statusCode: 200, message: "Product deleted successfully", data: { id: deleted.id, name: deleted.name } };
};