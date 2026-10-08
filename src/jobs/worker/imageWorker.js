import { Worker } from "bullmq";
import { redisConnection } from "../../config/redisConfig.js";
import { cloudStorage as cloudinary } from "../../config/cloudinaryConfig.js"
import logger from "../../utils/logger.js";

const connection = redisConnection;

export const moveImage = async ({ fromId, toId }) => {
    try {
        await cloudinary.uploader.rename(fromId, toId, { overwrite: false, invalidate: true });
    } catch (error) {
        // An earlier attempt may have succeeded. Only fail (and retry) if the target is missing.
        // This Admin API call only happens on the error path, so it barely touches your rate limit.
        await cloudinary.api.resource(toId, { resource_type: "image" }).catch(() => {
            throw error;
        });
    }
};

const processor = async ({ name, data }) => {
    if (name === "move") return moveImage(data);

    if (name === "delete") {
        await Promise.all(
            data.publicIds.map((id) =>
                cloudinary.uploader.destroy(id, { invalidate: true, resource_type: "image" })
            )
        ); // "not found" is a normal result, not an error
    }
};

const worker = new Worker("images", processor, { connection, concurrency: 10 });

worker.on("failed", (job, err) => {
    const final = job.attemptsMade >= (job.opts.attempts ?? 1);
    logger[final ? "error" : "warn"]({ err, jobId: job.id, name: job.name, data: job.data, final }, "Image job failed");
});
worker.on("error", (err) => logger.error({ err }, "Image worker error"));

const shutdown = async () => {
    await worker.close(); // lets running jobs finish
    process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

logger.info("Image worker started");