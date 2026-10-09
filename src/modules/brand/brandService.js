import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import { slugify, randomSuffix } from "../../utils/slug.js";
import { planNewImage, planImageField, publicIdOf, dispatchMoves, dispatchDeletes } from "../../utils/imageUpload.js";
import {
    createBrandModel, getBrandsModel, getBrandByIdModel, updateBrandModel,
    setBrandAvailabilityModel, deleteBrandModel, countBrandProductsModel,
} from "./brandModel.js";

const SLUG_MAX_ATTEMPTS = 3;

const isUniqueViolation = (error) => error?.code === "P2002";
const isNotFound = (error) => error?.code === "P2025";
const isForeignKeyViolation = (error) => error?.code === "P2003";

export const createBrandService = async (storeId, payload) => {
    const { name, logo, description, seoTitle, seoImage, isAvailable } = payload;
    const baseSlug = slugify(name, { fallback: "brand" });

    logger.info({ storeId }, "Attempting to create brand");

    // Instant string work. Throws a 400 before any DB call if a URL is invalid.
    const logoPlan = logo ? planNewImage(logo, storeId, "brands") : null;
    const seoPlan = seoImage ? planNewImage(seoImage, storeId, "brand-seo") : null;
    const moves = [logoPlan?.move, seoPlan?.move].filter(Boolean);

    for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt++) {
        const slug = attempt === 1 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
        try {
            const brand = await createBrandModel(storeId, {
                name, slug, description, seoTitle, isAvailable,
                logo: logoPlan?.url ?? null,
                seoImage: seoPlan?.url ?? null,
            });

            dispatchMoves(moves); // the worker renames the files, the response doesn't wait

            logger.info({ storeId, brandId: brand.id }, "Brand created successfully");
            return { statusCode: 201, message: "Brand created successfully", data: { brand } };
        } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            logger.warn({ storeId, slug, attempt }, "Brand slug collision, retrying");
        }
    }

    throw new AppError("Could not generate a unique slug, please try again", constants.Conflict);
};

export const getBrandsService = async (storeId, query) => {
    logger.info({ storeId }, "fetching brands");
    const { items, total } = await getBrandsModel(storeId, query);

    return {
        statusCode: 200,
        message: "Brands fetched successfully",
        data: {
            brands: items,
            pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
        },
    };
};

export const getBrandService = async (storeId, brandId) => {
    const brand = await getBrandByIdModel(storeId, brandId);
    if (!brand) throw new AppError("Brand not found", constants.NotFound);

    return { statusCode: 200, message: "Brand fetched successfully", data: { brand } };
};

export const updateBrandService = async (storeId, brandId, payload) => {
    logger.info({ storeId, brandId }, "Updating brand");

    const { logo, seoImage, ...rest } = payload;

    // Only read the brand when an image is part of the request. Otherwise P2025 gives the 404.
    const needsExisting = logo !== undefined || seoImage !== undefined;
    const existing = needsExisting ? await getBrandByIdModel(storeId, brandId) : null;
    if (needsExisting && !existing) throw new AppError("Brand not found", constants.NotFound);

    // Plan everything before the DB write (throws a 400 on a bad URL)
    const logoPlan = planImageField(logo, existing?.logo, storeId, "brands");
    const seoPlan = planImageField(seoImage, existing?.seoImage, storeId, "brand-seo");

    let brand;
    try {
        brand = await updateBrandModel(storeId, brandId, {
            ...rest,
            logo: logoPlan.url,        // undefined is skipped by Prisma, null removes
            seoImage: seoPlan.url,
        });
    } catch (error) {
        if (isUniqueViolation(error)) throw new AppError("Slug already exists. Please choose a different slug", constants.Conflict);
        if (isNotFound(error)) throw new AppError("Brand not found", constants.NotFound);
        throw error;
    }

    // DB succeeded: the worker moves the new files and deletes the replaced or removed ones
    dispatchMoves([logoPlan.move, seoPlan.move].filter(Boolean));
    dispatchDeletes([logoPlan.removedId, seoPlan.removedId]);

    logger.info({ storeId, brandId }, "Brand updated successfully");
    return { statusCode: 200, message: "Brand updated successfully", data: { brand } };
};

export const setBrandAvailabilityService = async (storeId, brandId) => {
    const existing = await getBrandByIdModel(storeId, brandId);
    if (!existing) throw new AppError("Brand not found", constants.NotFound);

    const brand = await setBrandAvailabilityModel(storeId, brandId, !existing.isAvailable);

    return {
        statusCode: 200,
        message: `Brand turned ${!existing.isAvailable ? "on" : "off"} successfully`,
        data: { brand },
    };
};

export const deleteBrandService = async (storeId, brandId) => {
    logger.info({ storeId, brandId }, "Deleting brand");

    let deleted;
    try {
        deleted = await deleteBrandModel(storeId, brandId);
    } catch (error) {
        if (isNotFound(error)) throw new AppError("Brand not found", constants.NotFound);

        if (isForeignKeyViolation(error)) {
            const count = await countBrandProductsModel(brandId);
            logger.warn({ storeId, brandId, count }, "Brand delete blocked by products");

            throw new AppError(
                count > 0
                    ? `This brand can't be deleted because it has ${count} ${count === 1 ? "product" : "products"} attached to it (and any orders placed for them). Move or remove the products first, or turn the brand off instead.`
                    : "This brand can't be deleted because other records are still attached to it. Turn the brand off instead.",
                constants.Conflict
            );
        }
        throw error;
    }

    // DB delete succeeded: the worker deletes the files
    dispatchDeletes([
        publicIdOf(deleted.logo, storeId, "brands"),
        publicIdOf(deleted.seoImage, storeId, "brand-seo"),
    ]);

    logger.info({ storeId, brandId }, "Brand deleted successfully");
    return { statusCode: 200, message: "Brand deleted successfully", data: { id: deleted.id, name: deleted.name } };
};