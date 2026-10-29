import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";
import { getStoreCached } from "../utils/storeCache.js";

const verifyStore = async (req, res, next) => {
    try {
        const storeId = req.headers["x-store-id"];
        if (!storeId) throw new AppError("x-store-id header is required", constants.BadRequest);

        const store = await getStoreCached(req.userId, storeId);
        if (!store) throw new AppError("Store not found", constants.NotFound);

        req.storeId = storeId;
        req.store = store;
        next();
    } catch (error) {
        next(error);
    }
};

export default verifyStore;