import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { fileTypeFromBuffer } from "file-type";
import AppError from "./AppError.js";
import logger from "./logger.js";
import constants from "./constants.js";

const { maxImagesPerUpload } = constants.IMAGE_LIMITS;

// The Cloudinary Admin API rejects delete_resources calls with more than 100
// public ids, so bulk deletes are chunked.
const DELETE_CHUNK_SIZE = 100;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

// ONE regex drives both "is this our image?" and "what is its public id?".
// It is anchored to this deployment's delivery host, which is what makes
// deletion safe: a URL that does not match yields no public id, so the destroy
// call is simply never made. Formats are matched case-insensitively and the
// optional /v<timestamp>/ segment is stripped, so the captured id is the real
// asset id and not a versioned or transformed variant.
const CLOUDINARY_IMAGE_URL_REGEX = new RegExp(
    `^https://res\\.cloudinary\\.com/${CLOUDINARY_CLOUD_NAME}/image/upload/(?:v\\d+/)?(.+?)\\.(?:jpe?g|png|webp|avif|gif)$`,
    "i"
);

// A delivery URL that carries transformations (w_100,h_100,c_fill/...) has the
// transformation glued onto the front of the path, so the captured "public id"
// is not a real asset id and can never be destroyed. Nothing in this app
// uploads with transformations, so such a URL is rejected outright rather than
// stored as an image that could never be cleaned up. A comma is a strong signal
// and has no false positives; a short "flag_value" segment is the second-best
// signal, and erring towards "transformation" only costs an orphaned asset
// (logged) rather than a failed destroy.
const TRANSFORMATION_SEGMENT = /,|^[a-z]{1,3}_[\w.,]+(?:,[a-z]{1,3}_[\w.,]+)*$/i;

const looksLikeTransformation = (publicId) =>
    typeof publicId === "string" && publicId.split("/").some((segment) => TRANSFORMATION_SEGMENT.test(segment));

const extractPublicIdFromUrl = (url) => {
    try {
        const match = typeof url === "string" ? url.match(CLOUDINARY_IMAGE_URL_REGEX) : null;
        if (!match || looksLikeTransformation(match[1])) return null;
        return match[1];
    } catch (error) {
        logger.error("Error extracting public ID", error);
        return null;
    }
};

function isValidCloudinaryImageUrl(url) {
    if (typeof url !== "string") return false;
    return CLOUDINARY_IMAGE_URL_REGEX.test(url);
}

const validateRealFileType = async (buffer) => {
    const fileTypeResult = await fileTypeFromBuffer(buffer);

    if (!fileTypeResult || !fileTypeResult.mime.startsWith("image/")) {
        throw new AppError("Invalid file type", constants.BadRequest);
    }
    return fileTypeResult.mime;
}

const uploadBufferToCloudinary = (buffer, folder) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image' },
            (error, result) => {
                if (error) {
                    logger.error("Cloudinary upload error", error);
                    return reject(error);
                }
                resolve(result);
            }
        );

        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
};

const deleteFromCloudinary = async (imageUrl) => {
    if (!imageUrl) return;

    const publicId = extractPublicIdFromUrl(imageUrl);
    if (!publicId) return;

    try {
        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.destroy(publicId, { resource_type: 'image' }, (error, result) => {
                if (error) {
                    logger.error("Cloudinary delete error", error);
                    return reject(error);
                }
                resolve(result);
            });
        });
    } catch (err) {
        logger.error("Error deleting image", err);
    }
};

// delete_resources answers with `deleted` and `failed` as OBJECTS keyed by
// public id ({"some_id":"deleted","other":"not found"}), so the shapes are
// normalised here instead of being passed through. "not found" is treated as
// success: the goal is that the asset no longer exists, not that the API said 200.
const summariseDeleteResult = (result) => {
    const toEntries = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map((id) => [id, "deleted"]);
        return Object.entries(value);
    };

    const deleted = [];
    const failed = [];

    for (const [publicId, status] of toEntries(result?.deleted)) {
        if (status === "deleted" || status === "not found") deleted.push(publicId);
        else failed.push(publicId);
    }

    for (const [publicId] of toEntries(result?.failed)) {
        failed.push(publicId);
    }

    return { deleted, failed };
};

const deleteMultipleFromCloudinary = (publicIds) => {
    const ids = Array.from(new Set(publicIds.filter(Boolean)));
    if (ids.length === 0) {
        return Promise.resolve({ deleted: [], failed: [] });
    }

    const chunks = [];
    for (let i = 0; i < ids.length; i += DELETE_CHUNK_SIZE) {
        chunks.push(ids.slice(i, i + DELETE_CHUNK_SIZE));
    }

    return Promise.all(
        chunks.map(
            (chunk) =>
                new Promise((resolve) => {
                    cloudinary.api.delete_resources(chunk, { resource_type: 'image' }, (error, result) => {
                        if (error) {
                            logger.error({ error, chunk }, "Cloudinary bulk delete error");
                            return resolve({ deleted: [], failed: chunk });
                        }
                        resolve(summariseDeleteResult(result));
                    });
                })
        )
    ).then((results) => ({
        deleted: results.flatMap((result) => result.deleted),
        failed: results.flatMap((result) => result.failed),
    }));
};

// Turns stored URLs into public ids that are safe to destroy.
// `allowedPrefix` restricts deletion to the folder(s) the current user/shop owns
// (e.g. "shops/<shopId>"), so a client cannot point a stored URL at another
// tenant's folder and have it destroyed. Anything that fails validation is
// skipped and logged rather than deleted.
const getDeletablePublicIds = (urls, allowedPrefix = null) => {
    const prefixes = (Array.isArray(allowedPrefix) ? allowedPrefix : [allowedPrefix])
        .filter(Boolean)
        .map((prefix) => `${prefix}/`);

    const ids = [];

    for (const url of urls ?? []) {
        // No stored image at all is the normal first-upload case, not a problem.
        if (!url) continue;

        const publicId = extractPublicIdFromUrl(url);

        if (!publicId) {
            logger.warn({ url }, "Skipping image cleanup: not a Cloudinary URL of this cloud");
            continue;
        }

        if (prefixes.length > 0 && !prefixes.some((prefix) => publicId.startsWith(prefix))) {
            logger.warn({ publicId, prefixes }, "Skipping image cleanup: image is outside the expected folder");
            continue;
        }

        ids.push(publicId);
    }

    return Array.from(new Set(ids));
};

// Single entry point used by every update flow: given the URLs currently stored
// and the URLs about to be stored, destroy whatever is being removed. Passing
// null/[] for nextUrls means "the user removed everything", which is exactly how
// `image: null` or a shortened gallery array is expressed.
const syncDeleteImages = async ({ currentUrls = [], nextUrls = [], allowedPrefix = null }) => {
    const current = new Set(getDeletablePublicIds(currentUrls, allowedPrefix));
    const next = new Set(getDeletablePublicIds(nextUrls, allowedPrefix));

    const removed = Array.from(current).filter((publicId) => !next.has(publicId));
    if (removed.length === 0) {
        return { deleted: [], failed: [] };
    }

    try {
        const result = await deleteMultipleFromCloudinary(removed);
        if (result.failed.length > 0) {
            logger.error({ failed: result.failed }, "Some images could not be deleted from Cloudinary");
        } else {
            logger.info({ deleted: result.deleted }, "Removed images deleted from Cloudinary");
        }
        return result;
    } catch (error) {
        // The database row is already updated by the time this runs, so a
        // Cloudinary failure must not fail the request: the worst case is an
        // orphaned asset, not a rolled-back update.
        logger.error({ error, removed }, "Cloudinary image cleanup failed");
        return { deleted: [], failed: removed };
    }
};

export {
    extractPublicIdFromUrl,
    validateRealFileType,
    uploadBufferToCloudinary,
    deleteFromCloudinary,
    deleteMultipleFromCloudinary,
    syncDeleteImages as deleteImagesSafely,
    getDeletablePublicIds,
    isValidCloudinaryImageUrl,
    maxImagesPerUpload,
}