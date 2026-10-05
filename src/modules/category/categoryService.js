import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import { slugify, randomSuffix } from "../../utils/slug.js";
import {
    createCategoryModel,
    getCategoriesModel,
    getCategoryByIdModel,
    updateCategoryModel,
    setCategoryAvailabilityModel,
    deleteCategoryModel,
    countCategoryProductsModel,
    getCategoryWithImagesModel
} from "./categoryModel.js";
import {
    finalizeImage,
    revertImage,
    deleteImageByUrl
} from "../../utils/imageUpload.js"

const SLUG_MAX_ATTEMPTS = 3;

// The only unique constraint on categories besides the id is (storeId, slug),
// so a P2002 here always means "slug already taken in this store".
const isUniqueViolation = (error) => error?.code === "P2002";
const isNotFound = (error) => error?.code === "P2025";
const isForeignKeyViolation = (error) => error?.code === "P2003";

export const createCategoryService = async (storeId, payload) => {
    const { name, image, description, seoTitle, seoImage, isAvailable } = payload;
    const baseSlug = slugify(name, { fallback: "category" });

    const finalImage = await finalizeImage(image, storeId, "categories");
    const finalSeoImage = seoImage ? await finalizeImage(seoImage, storeId, "seo") : null;

    logger.info({ storeId }, "Attempting to create category");

    for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt++) {
        // First try the clean slug, then add -xxxx on each retry
        const slug = attempt === 1 ? baseSlug : `${baseSlug}-${randomSuffix()}`;

        try {
            const category = await createCategoryModel(storeId, {
                name, slug, description, seoTitle, isAvailable,
                image: finalImage.url,
                seoImage: finalSeoImage?.url ?? null,
            });

            logger.info({ storeId, categoryId: category.id }, "Category created successfully");

            return {
                statusCode: 201,
                message: "Category created successfully",
                data: { category },
            };
        } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            logger.warn({ storeId, slug, attempt }, "Category slug collision, retrying");
        }
    }
    await Promise.all([revertImage(finalImage), revertImage(finalSeoImage)]);
    throw new AppError("Could not generate a unique slug, please try again", constants.Conflict);
};

export const getCategoriesService = async (storeId, query) => {
    logger.info({ storeId }, "fetching categories");
    const { items, total } = await getCategoriesModel(storeId, query);

    return {
        statusCode: 200,
        message: "Categories fetched successfully",
        data: {
            categories: items,
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        },
    };
};

export const getCategoryService = async (storeId, categoryId) => {
    logger.info({ storeId, categoryId }, "fetching category");
    const category = await getCategoryByIdModel(storeId, categoryId);
    if (!category) throw new AppError("Category not found", constants.NotFound);

    return {
        statusCode: 200,
        message: "Category fetched successfully",
        data: { category },
    };
};

export const updateCategoryService = async (storeId, categoryId, payload) => {
    logger.info({ storeId, categoryId }, "updating category");
    const existing = await getCategoryWithImagesModel(storeId, categoryId);
    if (!existing) throw new AppError("Category not found", constants.NotFound);

    const { image, seoImage, ...rest } = payload;

    const newImage = image && image !== existing.image ? await finalizeImage(image, storeId, "categories") : null;
    const newSeoImage = seoImage && seoImage !== existing.seoImage ? await finalizeImage(seoImage, storeId, "seo") : null;

    try {
        const category = await updateCategoryModel(storeId, categoryId, {
            ...rest,
            ...(newImage && { image: newImage.url }),
            ...(newSeoImage && { seoImage: newSeoImage.url }),
        });

        // DB succeeded, so clean up the replaced files (best effort, never blocks the response)
        let tasks = [];
        if (newImage) tasks.push(deleteImageByUrl(existing.image, storeId, "categories"));
        if (newSeoImage) tasks.push(deleteImageByUrl(existing.seoImage, storeId, "seo"));
        await Promise.all(tasks);

        return { statusCode: 200, message: "Category updated successfully", data: { category } };
    } catch (error) {
        await Promise.all([revertImage(newImage), revertImage(newSeoImage)]);
        if (isUniqueViolation(error)) {
            throw new AppError("Slug already exists. Please choose a different slug", constants.Conflict);
        }
        if (isNotFound(error)) {
            throw new AppError("Category not found", constants.NotFound);
        }
        throw error;
    }
};

export const setCategoryAvailabilityService = async (storeId, categoryId, isAvailable) => {
    try {
        const category = await setCategoryAvailabilityModel(storeId, categoryId, isAvailable);

        return {
            statusCode: 200,
            message: `Category turned ${isAvailable ? "on" : "off"} successfully`,
            data: { category },
        };
    } catch (error) {
        if (isNotFound(error)) throw new AppError("Category not found", constants.NotFound);
        throw error;
    }
};

export const deleteCategoryService = async (storeId, categoryId) => {
    logger.info({ storeId, categoryId }, "deleting category");
    let deletedCategory;
    try {
        deletedCategory = await deleteCategoryModel(storeId, categoryId);
    } catch (error) {
        if (isNotFound(error)) {
            throw new AppError("Category not found", constants.NotFound);
        }

        if (isForeignKeyViolation(error)) {
            const count = await countCategoryProductsModel(categoryId);

            logger.warn({ storeId, categoryId, count }, "Category delete blocked by products");

            throw new AppError(
                count > 0
                    ? `This category can't be deleted because it has ${count} ${count === 1 ? "product" : "products"} attached to it (and any orders placed for them). Move or remove the products first, or turn the category off instead.`
                    : "This category can't be deleted because other records are still attached to it. Turn the category off instead.",
                constants.Conflict
            );
        }

        throw error;
    }

    let task = [];
    if (deletedCategory.image) task.push(deleteImageByUrl(deletedCategory.image, storeId, "categories"));
    if (deletedCategory.seoImage) task.push(deleteImageByUrl(deletedCategory.seoImage, storeId, "seo"));
    await Promise.all(task);

    logger.info({ storeId, categoryId }, "Category deleted successfully");
    return {
        statusCode: 200,
        message: "Category deleted successfully",
        data: { id: deletedCategory.id, name: deletedCategory.name },
    };
};