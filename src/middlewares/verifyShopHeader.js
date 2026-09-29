import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";

export const SHOP_ID_HEADER = "x-shop-id";

// The shop is ALWAYS resolved from the JWT (via requireShop), never from the
// header. Shop ids are public - they are returned by GET /shops - so a header
// supplied value could otherwise be used to write into a competitor's catalog.
// This only cross-checks what the caller claims against what they own.
const verifyShopHeader = (req, res, next) => {
    const headerShopId = req.get(SHOP_ID_HEADER);

    if (headerShopId && headerShopId !== req.shop.id) {
        return next(
            new AppError("x-shop-id does not match the authenticated shop", constants.Forbidden)
        );
    }

    return next();
};

export default verifyShopHeader;
