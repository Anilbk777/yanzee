import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import {
    createShop,
    getShopByOwnerId,
    getShopById,
    updateShopById,
    deleteShopById,
    listShops,
} from "./shopModel.js";

const isUniqueViolation = (error) => error?.code === "P2002";
const isMissingRecord = (error) => error?.code === "P2025";
const isForeignKeyViolation = (error) => error?.code === "P2003";

const createShopService = async (ownerId, payload) => {
    logger.info({ ownerId }, "Attempting to create shop");

    const existingShop = await getShopByOwnerId(ownerId);
    if (existingShop) {
        throw new AppError("You already own a shop", constants.Conflict);
    }

    const { name, contactEmail, image, description, returnPolicy } = payload;

    let shop;
    try {
        shop = await createShop({
            ownerId,
            name,
            contactEmail,
            image: image ?? null,
            description: description ?? null,
            returnPolicy: returnPolicy ?? null,
        });
    } catch (error) {
        if (isUniqueViolation(error)) {
            throw new AppError("You already own a shop", constants.Conflict);
        }
        throw error;
    }

    logger.info({ shopId: shop.id, ownerId }, "Shop created successfully");

    return {
        statusCode: 201,
        message: "Shop created successfully",
        data: { shop },
    };
};

const getMyShopService = async (shop) => {
    return {
        statusCode: 200,
        message: "Shop fetched successfully",
        data: { shop },
    };
};

const updateMyShopService = async (shop, payload) => {
    logger.info({ shopId: shop.id }, "Attempting to update shop");

    const data = {};
    for (const key of ["name", "contactEmail", "image", "description", "returnPolicy"]) {
        if (key in payload) {
            data[key] = payload[key] ?? null;
        }
    }

    let updatedShop;
    try {
        updatedShop = await updateShopById(shop.id, data);
    } catch (error) {
        if (isMissingRecord(error)) {
            throw new AppError("Shop not found", constants.NotFound);
        }
        throw error;
    }

    logger.info({ shopId: updatedShop.id }, "Shop updated successfully");

    return {
        statusCode: 200,
        message: "Shop updated successfully",
        data: { shop: updatedShop },
    };
};

const deleteMyShopService = async (shop) => {
    logger.info({ shopId: shop.id }, "Attempting to delete shop");

    try {
        await deleteShopById(shop.id);
    } catch (error) {
        if (isMissingRecord(error)) {
            throw new AppError("Shop not found", constants.NotFound);
        }
        // Orders reference the shop without a cascade, so a shop that already
        // has orders cannot be removed.
        if (isForeignKeyViolation(error)) {
            throw new AppError(
                "Shop cannot be deleted while it has orders. Contact support.",
                constants.Conflict
            );
        }
        throw error;
    }

    logger.info({ shopId: shop.id }, "Shop deleted successfully");

    return {
        statusCode: 200,
        message: "Shop deleted successfully",
    };
};

const getShopByIdService = async (shopId) => {
    const shop = await getShopById(shopId);

    if (!shop) {
        throw new AppError("Shop not found", constants.NotFound);
    }

    return {
        statusCode: 200,
        message: "Shop fetched successfully",
        data: { shop },
    };
};

const listShopsService = async ({ page, limit, search }) => {
    const { shops, total } = await listShops({ page, limit, search });

    return {
        statusCode: 200,
        message: "Shops fetched successfully",
        data: {
            shops,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1),
            },
        },
    };
};

export {
    createShopService,
    getMyShopService,
    updateMyShopService,
    deleteMyShopService,
    getShopByIdService,
    listShopsService,
};
