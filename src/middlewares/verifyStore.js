import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";
import { getStoreByIdModel } from "../modules/store/storeModel.js"

const verifyStore = async (req, res, next) => {
    const storeId = req.headers["x-store-id"];

    if (!storeId) {
        throw new AppError("x-store-id header is required", constants.BadRequest);
    }

    const store = await getStoreByIdModel(req.userId, storeId);

    if (!store) {
        throw new AppError("Store not found", constants.NotFound);
    }

    req.storeId = storeId;
    req.store = store;
    next();
}

export default verifyStore;