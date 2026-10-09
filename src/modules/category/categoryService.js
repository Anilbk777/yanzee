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
import { planNewImage, planImageField, publicIdOf, dispatchMoves, dispatchDeletes } from "../../utils/imageUpload.js";

const SLUG_MAX_ATTEMPTS = 3;

// The only unique constraint on categories besides the id is (storeId, slug),
// so a P2002 here always means "slug already taken in this store".
const isUniqueViolation = (error) => error?.code === "P2002";
const isNotFound = (error) => error?.code === "P2025";
const isForeignKeyViolation = (error) => error?.code === "P2003";

export const createCategoryService = async (storeId, payload) => {
    const { name, image, description, seoTitle, seoImage, isAvailable } = payload;
    const baseSlug = slugify(name, { fallback: "category" });

    logger.info({ storeId }, "Attempting to create category");

    // image is required. Instant string work, throws a 400 before any DB call.
    const imagePlan = planNewImage(image, storeId, "categories");
    const seoPlan = seoImage ? planNewImage(seoImage, storeId, "category-seo") : null;
    const moves = [imagePlan.move, seoPlan?.move].filter(Boolean);

    for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt++) {
        const slug = attempt === 1 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
        try {
            const category = await createCategoryModel(storeId, {
                name, slug, description, seoTitle, isAvailable,
                image: imagePlan.url,
                seoImage: seoPlan?.url ?? null,
            });

            dispatchMoves(moves);

            logger.info({ storeId, categoryId: category.id }, "Category created successfully");
            return { statusCode: 201, message: "Category created successfully", data: { category } };
        } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            logger.warn({ storeId, slug, attempt }, "Category slug collision, retrying");
        }
    }

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
    logger.info({ storeId, categoryId }, "Updating category");

    const { image, seoImage, ...rest } = payload;

    const needsExisting = image !== undefined || seoImage !== undefined;
    const existing = needsExisting ? await getCategoryWithImagesModel(storeId, categoryId) : null;
    if (needsExisting && !existing) throw new AppError("Category not found", constants.NotFound);

    const imagePlan = planImageField(image, existing?.image, storeId, "categories");
    const seoPlan = planImageField(seoImage, existing?.seoImage, storeId, "category-seo");

    let category;
    try {
        category = await updateCategoryModel(storeId, categoryId, {
            ...rest,
            image: imagePlan.url,      // undefined = unchanged
            seoImage: seoPlan.url,     // null = removed
        });
    } catch (error) {
        if (isUniqueViolation(error)) throw new AppError("Slug already exists. Please choose a different slug", constants.Conflict);
        if (isNotFound(error)) throw new AppError("Category not found", constants.NotFound);
        throw error;
    }

    dispatchMoves([imagePlan.move, seoPlan.move].filter(Boolean));
    dispatchDeletes([imagePlan.removedId, seoPlan.removedId]);

    logger.info({ storeId, categoryId }, "Category updated successfully");
    return { statusCode: 200, message: "Category updated successfully", data: { category } };
};

export const setCategoryAvailabilityService = async (storeId, categoryId) => {
    const category = await getCategoryByIdModel(storeId, categoryId);
    if (!category) throw new AppError("Category not found", constants.NotFound);

    const updatedCategory = await setCategoryAvailabilityModel(storeId, categoryId, !category.isAvailable);

    return {
        statusCode: 200,
        message: `Category turned ${!category.isAvailable ? "on" : "off"} successfully`,
        data: { category: updatedCategory },
    };

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

    dispatchDeletes([
        publicIdOf(deletedCategory.image, storeId, "categories"),
        publicIdOf(deletedCategory.seoImage, storeId, "category-seo"),
    ]);

    logger.info({ storeId, categoryId }, "Category deleted successfully");
    return {
        statusCode: 200,
        message: "Category deleted successfully",
        data: { id: deletedCategory.id, name: deletedCategory.name },
    };
};