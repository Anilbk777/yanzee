import "dotenv/config"
import IORedis from 'ioredis';
import logger from '../utils/logger.js';

export const redisConnection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    keepAlive: 5000,
    connectTimeout: 10000,
    retryStrategy: (times)=> Math.min(times * 500, 5000),
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
});

redisConnection.on('connect', () => logger.info('Redis connected'));
redisConnection.on('error', (err) => logger.error({ err: err.message }, 'Redis connection error'));

export const checkRedis = async () => {
    try {
        await redisConnection.ping();
        logger.info('Redis ping OK');
        return true;
    } catch (err) {
        logger.error({ err: err.message }, 'Redis not reachable');
        return false;
    }
};
