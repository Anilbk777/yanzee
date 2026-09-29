import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";
import { getShopByOwnerId } from "../modules/shop/shopModel.js";

// Role gate only. Returns 403 (not 401) because the caller IS authenticated,
// they just are not allowed to perform this action.
const requireOwner = async (req, res, next) => {
    if (req.user?.role !== "SHOP_OWNER") {
        throw new AppError("Only shop owners can perform this action", constants.Forbidden);
    }

    const shop = req.user.shop ?? (await getShopByOwnerId(req.userId));
    if (!shop) {
        throw new AppError("You do not have a shop yet", constants.NotFound);
    }

    req.shop = shop;
    next();
};

export default requireOwner;
