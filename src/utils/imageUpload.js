import { randomUUID } from "crypto";
import streamifier from "streamifier";
import { fileTypeFromBuffer } from "file-type";
import { v2 as cloudinary } from 'cloudinary';

import logger from "../utils/logger.js";
import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";

export const IMAGE_ENTITY_TYPES = ["categories", "brands", "products", "logos", "seo"];

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const validateRealFileType = async (buffer) => {
  const fileTypeResult = await fileTypeFromBuffer(buffer);

  if (!fileTypeResult || !fileTypeResult.mime.startsWith("image/")) {
    throw new AppError("Invalid file type", constants.BadRequest);
  }
  return fileTypeResult.mime;
};

const uploadToCloudinary = (buffer, publicId) =>
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
// Goes to temp/ and is moved later (categories, brands, products...)
export const uploadTempImage = (buffer, storeId, kind) =>
  uploadToCloudinary(buffer, `temp/stores/${storeId}/${kind}/${randomUUID()}`);

// Goes straight to the permanent path (store logo)
export const uploadImage = (buffer, storeId, kind) =>
  uploadToCloudinary(buffer, `stores/${storeId}/${kind}/${randomUUID()}`);


// Returns { publicId, isTemp } if the URL is OUR cloud, THIS store, THIS entityType; otherwise null
export const parseImageUrl = (rawUrl, storeId, entityType) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.search || url.hash) {
    return null;
  }

  // storeId comes from the DB (verifyStore) and entityType from an allowlist, so both are safe in a regex
  const re = new RegExp(
    `^/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/(?:v\\d+/)?((temp/)?stores/${storeId}/${entityType}/${UUID})\\.webp$`,
    "i"
  );
  const match = url.pathname.match(re);

  return match ? { publicId: match[1], isTemp: Boolean(match[2]) } : null;
};

// Validates the URL and moves temp/ -> permanent when needed.
// Already-permanent URLs (client re-sending the current image) pass through untouched.
export const finalizeImage = async (rawUrl, storeId, entityType) => {
  const parsed = parseImageUrl(rawUrl, storeId, entityType);
  if (!parsed) throw new AppError("Invalid image URL", constants.BadRequest);

  if (!parsed.isTemp) return { url: rawUrl, publicId: parsed.publicId, moved: false };

  const tempId = parsed.publicId;
  const finalId = tempId.replace(/^temp\//, "");

  try {
    const result = await cloudinary.uploader.rename(tempId, finalId, {
      overwrite: false,
      invalidate: true,
    });
    return { url: result.secure_url, publicId: result.public_id, tempId, moved: true };
  } catch (error) {
    if (error?.http_code === 404) {
      throw new AppError("Image not found or expired, please upload it again", constants.BadRequest);
    }
    throw error;
  }
};

// Compensation: DB write failed after the move, so put the file back in temp/ for the sweeper
export const revertImage = (image) =>
  image?.moved
    ? cloudinary.uploader
      .rename(image.publicId, image.tempId, { overwrite: false })
      .catch((err) => logger.error({ err, image }, "Failed to revert image move"))
    : Promise.resolve();

// Best-effort delete of an image we own (e.g. replaced or category deleted)
export const deleteImageByUrl = async (rawUrl, storeId, entityType) => {
  const parsed = rawUrl && parseImageUrl(rawUrl, storeId, entityType);
  if (!parsed) return;

  await cloudinary.uploader
    .destroy(parsed.publicId, { invalidate: true })
    .catch((err) => logger.error({ err, publicId: parsed.publicId }, "Failed to delete image"));
  logger.info({ publicId: parsed.publicId }, "Deleted image successfully");
};

// Run daily. Deletes temp/ images older than maxAgeHours.
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