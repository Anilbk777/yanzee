import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";
import logger from "../utils/logger.js";
import { getStoreByIdModel } from "../modules/store/storeModel.js";
import { redisConnection } from "../config/redisConfig.js";

const redis = redisConnection;
const TTL_SEC = 5 * 60 * 60;

const getStoreCached = async (userId, storeId) => {
    const key = `${userId}:${storeId}`;
    const hit = await redis.hgetall(key);
    if (hit && Object.keys(hit).length > 0) {
        // hgetall returns all values as strings — coerce booleans back
        hit.isPublished = hit.isPublished === "true";
        return hit;
    } 
        
    const store = await getStoreByIdModel(userId, storeId);
    if (store && Object.keys(store).length > 0) {
        // ioredis hset does NOT accept a TTL option — use hset + expire separately
        await redis.hset(key, store);
        await redis.expire(key, TTL_SEC);
    }
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