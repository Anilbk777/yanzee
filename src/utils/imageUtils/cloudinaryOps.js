import { randomUUID } from "crypto";
import streamifier from "streamifier";
import cloudinary from "../../config/cloudinaryConfig.js"; // configured SDK, safe in the API and the worker
import logger from "../logger.js";

const upload = (buffer, publicId) =>
    new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                public_id: publicId,
                resource_type: "image",
                format: "webp",
                overwrite: false,
                transformation: [{ width: 1600, height: 1600, crop: "limit" }, { quality: "auto" }],
            },
            (error, result) => {
                if (error) {
                    logger.error({ err: error }, "Cloudinary upload error");
                    return reject(error);
                }
                resolve(result);
            }
        );
        streamifier.createReadStream(buffer).pipe(stream);
    });

// temp/ upload for categories, brands, products and SEO. The worker moves it later.
export const uploadTempImage = (buffer, storeId, kind) =>
    upload(buffer, `temp/stores/${storeId}/${kind}/${randomUUID()}`);

// Straight to the permanent path (store logo)
export const uploadImage = (buffer, storeId, kind) =>
    upload(buffer, `stores/${storeId}/${kind}/${randomUUID()}`);

// Rename temp -> permanent. Safe to retry: if the rename fails but the target exists, an earlier attempt succeeded.
export const moveImage = async ({ fromId, toId }) => {
    try {
        await cloudinary.uploader.rename(fromId, toId, { overwrite: false, invalidate: true });
    } catch (error) {
        await cloudinary.api.resource(toId, { resource_type: "image" }).catch(() => {
            throw error;
        });
    }
};

// "Not found" is not an error for destroy, so this is safe to retry
export const destroyImages = (publicIds) =>
    Promise.all(
        publicIds.map((id) => cloudinary.uploader.destroy(id, { invalidate: true, resource_type: "image" }))
    );

// Optional weekly safety net for uploads whose delayed expiry job was lost (for example Redis was down)
export const cleanupTempImages = async (maxAgeHours = 24) => {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    let cursor;
    let deleted = 0;

    do {
        const res = await cloudinary.api.resources({
            type: "upload",
            prefix: "temp/",
            max_results: 500,
            next_cursor: cursor,
        });

        const stale = res.resources
            .filter((r) => new Date(r.created_at).getTime() < cutoff)
            .map((r) => r.public_id);

        for (let i = 0; i < stale.length; i += 100) {
            await cloudinary.api.delete_resources(stale.slice(i, i + 100), {
                type: "upload",
                resource_type: "image",
                invalidate: true,
            });
        }

        deleted += stale.length;
        cursor = res.next_cursor;
    } while (cursor);

    logger.info({ deleted }, "Temp image cleanup finished");
};