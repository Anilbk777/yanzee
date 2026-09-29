import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";
import { getShopByOwnerId } from "../modules/shop/shopModel.js";

// A shop owner may hold the SHOP_OWNER role but not have created a shop yet.
// This guards the routes that operate on "the caller's own shop" by loading
// that shop once, attaching it to req.shop, and 404-ing when it does not exist.
const requireShop = async (req, res, next) => {
    try {
        const shop = await getShopByOwnerId(req.userId);

        if (!shop) {
            throw new AppError("You do not have a shop yet", constants.NotFound);
        }

        req.shop = shop;
        next();
    } catch (error) {
        next(error);
    }
};

export default requireShop;
