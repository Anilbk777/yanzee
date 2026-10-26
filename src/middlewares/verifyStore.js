import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";
import { getStoreByIdModel } from "../modules/store/storeModel.js"

// const verifyStore = async (req, res, next) => {
//     const storeId = req.headers["x-store-id"];

//     if (!storeId) {
//         throw new AppError("x-store-id header is required", constants.BadRequest);
//     }

//     const store = await getStoreByIdModel(req.userId, storeId);

//     if (!store) {
//         throw new AppError("Store not found", constants.NotFound);
//     }

//     req.storeId = storeId;
//     req.store = store;
//     next();
// }

// export default verifyStore;


const storeCache = new Map();
const TTL_MS = 60_000;

// export const invalidateStoreCache = (userId, storeId) => storeCache.delete(`${userId}:${storeId}`);

const getStoreCached = async (userId, storeId) => {
    const key = `${userId}:${storeId}`;
    const hit = storeCache.get(key);
    if (hit && hit.exp > Date.now()) return hit.store;

    const store = await getStoreByIdModel(userId, storeId);
    if (store) storeCache.set(key, { store, exp: Date.now() + TTL_MS });
    return store;
};

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