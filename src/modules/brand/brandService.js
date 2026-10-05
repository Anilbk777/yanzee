import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import { slugify, randomSuffix } from "../../utils/slug.js";
import { revertImage, deleteImageByUrl, prepareImage, claimImage } from "../../utils/imageUpload.js";
import {
    createBrandModel,
    getBrandsModel,
    getBrandByIdModel,
    updateBrandModel,
    setBrandAvailabilityModel,
    deleteBrandModel,
    countBrandProductsModel,
} from "./brandModel.js";

const SLUG_MAX_ATTEMPTS = 3;

const isUniqueViolation = (error) => error?.code === "P2002";
const isNotFound = (error) => error?.code === "P2025";
const isForeignKeyViolation = (error) => error?.code === "P2003";

export const createBrandService = async (storeId, payload) => {
    const { name, logo, description, seoTitle, seoImage, isAvailable } = payload;
    const baseSlug = slugify(name, { fallback: "brand" });

    logger.info({ storeId }, "Attempting to create brand");

    let logoFile = null;
    let seoFile = null;

    try {
        if (logo) logoFile = await claimImage(logo, storeId, "brands");
        if (seoImage) seoFile = await claimImage(seoImage, storeId, "seo");

        for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt++) {
            const slug = attempt === 1 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
            try {
                const brand = await createBrandModel(storeId, {
                    name,
                    slug,
                    description,
                    seoTitle,
                    isAvailable,
                    logo: logoFile?.url ?? null,
                    seoImage: seoFile?.url ?? null,
                });

                logger.info({ storeId, brandId: brand.id }, "Brand created successfully");

                return { statusCode: 201, message: "Brand created successfully", data: { brand } };
            } catch (error) {
                if (!isUniqueViolation(error)) throw error;
                logger.warn({ storeId, slug, attempt }, "Brand slug collision, retrying");
            }
        }

        throw new AppError("Could not generate a unique slug, please try again", constants.Conflict);
    } catch (error) {
        await Promise.all([revertImage(logoFile), revertImage(seoFile)]);
        throw error;
    }
};

export const getBrandsService = async (storeId, query) => {
    logger.info({ storeId }, "fetching brands");
    const { items, total } = await getBrandsModel(storeId, query);

    return {
        statusCode: 200,
        message: "Brands fetched successfully",
        data: {
            brands: items,
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        },
    };
};

export const getBrandService = async (storeId, brandId) => {
    const brand = await getBrandByIdModel(storeId, brandId);
    if (!brand) throw new AppError("Brand not found", constants.NotFound);

    return { statusCode: 200, message: "Brand fetched successfully", data: { brand } };
};

export const updateBrandService = async (storeId, brandId, payload) => {
    logger.info({ storeId, brandId }, "updating brand");
    const existing = await getBrandByIdModel(storeId, brandId);
    if (!existing) throw new AppError("Brand not found", constants.NotFound);

    const { logo, seoImage, ...rest } = payload;

    let newLogo = { url: undefined, file: null };
    let newSeo = { url: undefined, file: null };

    try {
        newLogo = await prepareImage(logo, existing.logo, storeId, "brands");
        newSeo = await prepareImage(seoImage, existing.seoImage, storeId, "seo");

        const brand = await updateBrandModel(storeId, brandId, {
            ...rest,
            logo: newLogo.url,       // undefined is skipped by Prisma
            seoImage: newSeo.url,
        });

        // DB succeeded, so delete the replaced or removed files (best effort)
        if (newLogo.url !== undefined) deleteImageByUrl(existing.logo, storeId, "brands");
        if (newSeo.url !== undefined) deleteImageByUrl(existing.seoImage, storeId, "seo");

        logger.info({ storeId, brandId }, "Brand updated successfully");

        return { statusCode: 200, message: "Brand updated successfully", data: { brand } };
    } catch (error) {
        await Promise.all([revertImage(newLogo.file), revertImage(newSeo.file)]);

        if (isUniqueViolation(error)) {
            throw new AppError("Slug already exists. Please choose a different slug", constants.Conflict);
        }
        if (isNotFound(error)) throw new AppError("Brand not found", constants.NotFound);
        throw error;
    }
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

    // DB delete succeeded, so clean up the files (best effort, doesn't block the response)
    let tasks = [];
    if (deleted.logo) tasks.push(deleteImageByUrl(deleted.logo, storeId, "brands"));
    if (deleted.seoImage) tasks.push(deleteImageByUrl(deleted.seoImage, storeId, "seo"));
    await Promise.all(tasks);

    logger.info({ storeId, brandId }, "Brand deleted successfully");

    return { statusCode: 200, message: "Brand deleted successfully", data: { id: deleted.id, name: deleted.name } };
};