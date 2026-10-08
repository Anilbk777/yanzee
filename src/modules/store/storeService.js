import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import crypto from "crypto";
import {
    createStoreModel,
    getStoresModel,
    getStoreByIdModel,
    updateStoreDetailModel,
    deleteStoreModel
} from "./storeModel.js";

import {
    deleteImageByUrl
} from "../../utils/imageUpload.js";


const SLUG_MAX_BASE_LENGTH = 40;
const SLUG_MAX_ATTEMPTS = 5;

const slugify = (text) => {
    const base = text
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")   // strip accents
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")       // non-alphanumerics -> hyphen
        .replace(/^-+|-+$/g, "")           // trim hyphens
        .slice(0, SLUG_MAX_BASE_LENGTH)
        .replace(/-+$/g, "");

    return base || "store";
};

const DIGITS = "0123456789";
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

const randomChar = (chars) => chars[crypto.randomInt(chars.length)];

const randomSuffix = () => `${randomChar(DIGITS)}${randomChar(DIGITS)}${randomChar(DIGITS)}${randomChar(LETTERS)}`;

export const generateSlug = (name) => `${slugify(name)}-${randomSuffix()}`;

const isSlugCollision = (error) => error?.code === "P2002" && error?.meta?.target?.includes("slug");

const createStoreService = async (userId, payload) => {
    logger.info({ userId }, "Attempting to create store");

    let store;

    for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt++) {
        try {
            const slug = generateSlug(payload.name)
            store = await createStoreModel(userId, {
                ...payload,
                slug
            });
            break;
        } catch (error) {
            if (isSlugCollision(error)) {
                logger.warn({ userId, attempt }, "Slug collision, retrying");
                continue;
            }
            throw error;
        }
    }

    if (!store) {
        throw new AppError("Failed to create a store, please try again", constants.Conflict);
    }

    logger.info({ storeId: store.id, userId }, "Store created successfully");

    return {
        statusCode: 201,
        message: "Store created successfully",
        data: { store },
    };
};

const getStoresService = async (userId) => {
    logger.info({ userId }, "Attempting to get stores for user");
    const stores = await getStoresModel(userId);
    logger.info({ userId, storeCount: stores.length }, "User stores fetched successfully");
    return {
        statusCode: 200,
        message: "User stores fetched successfully",
        data: { stores },
    };
}

const getStoreByIdService = async (userId, storeId) => {
    logger.info({ userId, storeId }, "getting store info by id");
    const store = await getStoreByIdModel(userId, storeId);
    logger.info({ storeId, userId }, "Store info fetched successfully");

    return {
        statusCode: 200,
        message: "Store info fetched successfully",
        data: { store },
    };
}

const updateStoreDetailService = async (userId, storeId, payload) => {
    logger.info({ userId, storeId }, "updating store details");
    const updatedStore = await updateStoreDetailModel(userId, storeId, payload);
    logger.info({ userId, storeId }, "Store details updated successfully");
    return {
        statusCode: 200,
        message: "Store details updated successfully",
        data: { updatedStore },
    };

}

const deleteStoreService = async (userId, storeId) => {
    logger.info({ userId, storeId }, "deleting store");

    const deletedStore = await deleteStoreModel(userId, storeId);
    if (deletedStore.logo) {
        await deleteImageByUrl(deletedStore.logo, storeId, "logos");
    }

    logger.info({ userId, storeId }, "Store deleted successfully");
    return {
        statusCode: 200,
        message: "Store deleted successfully",
        data: { deletedStore },
    };
}

const togglePublishService = async (userId, store) => {
    logger.info({ userId, storeId: store.id }, "Toggling store publish");
    const updatedStore = await updateStoreDetailModel(userId,store.id, { isPublished: !store.isPublished });
    logger.info({ userId, storeId: store.id, isPublished: updatedStore.isPublished }, "Store toggled successfully");
    return {
        statusCode: 200,
        message: `Store ${updatedStore.isPublished ? "published" : "unpublished"} successfully`,
        data: { updatedStore },
    };
}
export {
    createStoreService,
    getStoresService,
    getStoreByIdService,
    updateStoreDetailService,
    deleteStoreService,
    togglePublishService
}