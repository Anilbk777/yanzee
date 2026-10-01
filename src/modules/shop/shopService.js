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
    getShopByName
} from "./shopModel.js";

const isUniqueViolation = (error) => error?.code === "P2002";
const isMissingRecord = (error) => error?.code === "P2025";
const isForeignKeyViolation = (error) => error?.code === "P2003";

const createShopService = async (ownerId, payload) => {
    logger.info({ ownerId }, "Attempting to create shop");

    const tasks = [
        getShopByOwnerId(ownerId),
        getShopByName(payload.name)
    ]
    const [existingShop,] = await Promise.all(tasks);

    if (existingShop) {
        throw new AppError("You already own a shop", constants.Conflict);
    }

    const { name, contactEmail, image, description, returnPolicy, contactPhone, address } = payload;


    const shop = await createShop({
        ownerId,
        name,
        contactEmail,
        image: image ?? null,
        description: description ?? null,
        returnPolicy: returnPolicy ?? null,
        contactPhone: contactPhone ?? null,
        address: address ?? null,
    });


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
    for (const key of ["name", "contactEmail", "image", "description", "returnPolicy", "contactPhone", "address"]) {
        if (key in payload) {
            data[key] = payload[key] ?? null;
        }
    }

    const updatedShop = await updateShopById(shop.id, data);

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
    logger.info({ shopId }, "Attempting to get shop by ID");
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
    logger.info({ page, limit, search }, "Attempting to list shops");
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
