import { Queue } from "bullmq";
import { redisConnection } from "../../config/redisConfig.js";
import logger from "../../utils/logger.js";

export const imageQueue = new Queue("imagesQueue", {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 8,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 1000, 
    },
});

const safe = (id) => id.replaceAll("/", "_");

// moves: [{ fromId, toId }]. The same job id means no duplicates.
export const enqueueMoves = (moves) =>
    imageQueue.addBulk(
        moves.map((m) => ({ name: "move", data: m, opts: { jobId: `move_${safe(m.toId)}` } }))
    );

// Delete files. Delayed by default so an in-flight move finishes first and can't recreate the file.
export const enqueueDeletes = async (publicIds, { delay = 30_000 } = {}) => {
    if (publicIds.length === 0) return;

    await Promise.all(
        publicIds.map(async (id) => {
            // Cancel a move that hasn't started. Ignore the error if it is already running.
            await imageQueue.getJob(`move_${safe(id)}`).then((job) => job?.remove()).catch(() => null);

            return imageQueue.add(
                "delete",
                { publicIds: [id, `temp/${id}`] }, // the final path and the unmoved temp path
                { delay, jobId: `delete_${safe(id)}_${Date.now()}` }
            );
        })
    );
};

// Every temp upload cleans itself up after 24h. If it was claimed, the destroy is a no-op.
export const scheduleTempExpiry = (tempPublicId) =>
    imageQueue.add(
        "delete",
        { publicIds: [tempPublicId] },
        { delay: 24 * 60 * 60 * 1000, jobId: `expire_${safe(tempPublicId)}` }
    );

// Used when Redis is down: runs the move in-process so the product never points at a missing file
export const logQueueFailure = (err, what) => logger.error({ err }, `Image queue unavailable: ${what}`);