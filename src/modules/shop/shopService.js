import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { deleteFromCloudinary } from "../../utils/imageUpload.js";
import {
    createShop,
    getShopByOwnerId,
    getShopById,
    updateShopById,
    deleteShopById,
    listShops,
    getShopByName,
    getShopProductImageUrls,
    clearOrderItemImagesForShop
} from "./shopModel.js";

const isUniqueViolation = (error) => error?.code === "P2002";
const isMissingRecord = (error) => error?.code === "P2025";
const isForeignKeyViolation = (error) => error?.code === "P2003";

// Both are this owner's: images uploaded straight into the shop folder, and
// images uploaded before the shop existed, which wait in a per-user folder.
const ownedImageFolders = (shop) => [`shops/${shop.id}`, `shops/pending/${shop.ownerId}`];

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

    let shop;
    try {
        shop = await createShop({
            ownerId,
            name,
            contactEmail,
            image: image ?? null,
            description: description ?? null,
            returnPolicy: returnPolicy ?? null,
            contactPhone: contactPhone ?? null,
            address: address ?? null,
        });
    } catch (error) {

        if (isUniqueViolation(error)) {
            throw new AppError("Shop name already exists", constants.Conflict);
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
    for (const key of ["name", "contactEmail", "image", "description", "returnPolicy", "contactPhone", "address"]) {
        if (key in payload) {
            data[key] = payload[key] ?? null;
        }
    }

    if (data.name && data.name !== shop.name) {
        await getShopByName(data.name, shop.id);
    }

    // Only act on the image if the client explicitly sent the field.
    const imageFieldTouched = "image" in payload;
    const oldImageUrl = shop.image;
    const imageWillChange = imageFieldTouched && data.image !== oldImageUrl;

    let updatedShop;
    try {
        updatedShop = await updateShopById(shop.id, data);
    } catch (error) {
        if (isUniqueViolation(error)) {
            throw new AppError("Shop name already exists", constants.Conflict);
        }
        if (isMissingRecord(error)) {
            throw new AppError("Shop not found", constants.NotFound);
        }
        throw error;
    }

    // DB update succeeded — now it's safe to clean up the old Cloudinary asset.
    if (imageWillChange && oldImageUrl) {
        await deleteFromCloudinary(oldImageUrl);
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

    // Products cascade away with the shop, so every image they reference has to
    // be collected while the rows still exist.


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
    
    if (shop.image) {
        await Promise.all([
            deleteFromCloudinary(shop.image),
            clearOrderItemImagesForShop(shop.id),
        ])
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
