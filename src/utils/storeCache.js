import { redisConnection as redis } from "../config/redisConfig.js";
import logger from "./logger.js";
import { getStoreByIdModel } from "../modules/store/storeModel.js";

const TTL_SEC = 5 * 60; // see the note on TTL below

const key = {
    store: (storeId) => `store:${storeId}`,
    member: (userId, storeId) => `member:${userId}:${storeId}`,
};

// Redis problems must never take the API down: log them and fall back to the database
const safe = async (fn, fallback = null) => {
    try {
        return await fn();
    } catch (err) {
        logger.warn({ err: err.message }, "Cache unavailable, using the database");
        return fallback;
    }
};

export const getStoreCached = async (userId, storeId) => {
    // One round trip for both keys
    const [isMember, raw] = await safe(
        () => redis.mget(key.member(userId, storeId), key.store(storeId)),
        [null, null]
    );
    if (isMember && raw) return JSON.parse(raw); // needs BOTH: membership is checked on every request

    const store = await getStoreByIdModel(userId, storeId); // membership check and data in one query
    if (store) {
        void safe(() =>
            redis
                .multi()
                .set(key.store(storeId), JSON.stringify(store), "EX", TTL_SEC)
                .set(key.member(userId, storeId), "1", "EX", TTL_SEC)
                .exec()
        );
    }
    return store;
};

export const invalidateStore = (storeId) => safe(() => redis.del(key.store(storeId)));
export const invalidateMember = (userId, storeId) => safe(() => redis.del(key.member(userId, storeId)));