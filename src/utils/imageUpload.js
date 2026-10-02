import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { fileTypeFromBuffer } from "file-type";
import AppError from "./AppError.js";
import logger from "./logger.js";
import constants from "./constants.js";

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

const CLOUDINARY_IMAGE_URL_REGEX = new RegExp(
  `^https://res\\.cloudinary\\.com/${CLOUDINARY_CLOUD_NAME}/image/upload/(?:v\\d+/)?(.+?)\\.(?:jpe?g|png|webp|avif|gif)$`,
  "i",
);
const TRANSFORMATION_SEGMENT =
  /,|^[a-z]{1,3}_[\w.,]+(?:,[a-z]{1,3}_[\w.,]+)*$/i;

const looksLikeTransformation = (publicId) =>
  typeof publicId === "string" &&
  publicId.split("/").some((segment) => TRANSFORMATION_SEGMENT.test(segment));

const extractPublicIdFromUrl = (url) => {
  try {
    const match =
      typeof url === "string" ? url.match(CLOUDINARY_IMAGE_URL_REGEX) : null;
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

function validateImageUrls(urls) {
  if (!urls) return true;
  if (!Array.isArray(urls)) return false;
  for (const url of urls) {
    if (!isValidCloudinaryImageUrl(url)) return false;
  }
  return true;
}

function diffImages(currentImages, newImages) {
  const newPublicIds = newImages.map((img) => extractPublicIdFromUrl(img));
  const toDelete = currentImages.filter(
    (img) => !newPublicIds.includes(extractPublicIdFromUrl(img)),
  );
  return { toDelete };
}

const validateRealFileType = async (buffer) => {
  const fileTypeResult = await fileTypeFromBuffer(buffer);

  if (!fileTypeResult || !fileTypeResult.mime.startsWith("image/")) {
    throw new AppError("Invalid file type", constants.BadRequest);
  }
  return fileTypeResult.mime;
};

const uploadBufferToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        overwrite: true,
        invalidate: true,
        format: "png",
      },
      (error, result) => {
        if (error) {
          logger.error("Cloudinary upload error", error);
          return reject(error);
        }
        resolve(result);
      },
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

const deleteFromCloudinary = async (imageUrl) => {
  if (!imageUrl) return;

  const publicId = extractPublicIdFromUrl(imageUrl);
  if (!publicId) return;

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
    logger.info({ publicId, result }, "Cloudinary image deleted");
  } catch (err) {
    logger.error({ publicId, err }, "Error deleting Cloudinary image");
    // intentionally not re-thrown — cleanup failure shouldn't fail the update
  }
};

const deleteCloudinaryImages = async (publicIds = []) => {
  if (!publicIds.length) return;

  const BATCH_SIZE = 100;
  let chunks = [];
  for (let i = 0; i < publicIds.length; i += BATCH_SIZE) {
    chunks.push(publicIds.slice(i, i + BATCH_SIZE));
  }

  try {
    const results = await Promise.all(
      chunks.map((chunk) =>
        cloudinary.api.delete_resources(chunk, {
          resource_type: "image",
          invalidate: true,
        }),
      ),
    );
    logger.info({
      msg: "Cloudinary bulk delete completed",
      count: publicIds.length,
    });
    return results;
  } catch (err) {
    logger.error({
      msg: "Failed to bulk delete Cloudinary images",
      error: err.message,
    });
  }
};

export {
  extractPublicIdFromUrl,
  validateRealFileType,
  uploadBufferToCloudinary,
  deleteFromCloudinary,
  isValidCloudinaryImageUrl,
  validateImageUrls,
  deleteCloudinaryImages,
  diffImages,
};
