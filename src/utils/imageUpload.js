import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { fileTypeFromBuffer } from "file-type";
import AppError from "./AppError.js";
import logger from "./logger.js";
import constants from "./constants.js";

const extractPublicIdFromUrl = (url) => {
    try {
        // Regex looks for anything after /upload/ (ignoring optional version numbers like v1234567/) 
        // up until the file extension (.jpg, .png, .webp, etc.)
        const regex = /\/v\d+\/([^\s.]+)\.[a-z0-9]+$|\/upload\/([^\s.]+)\.[a-z0-9]+$/i;
        const match = url.match(regex);

        // Return whichever capture group matched (with or without version prefix)
        return match ? (match[1] || match[2]) : null;
    } catch (error) {
        logger.error("Error extracting public ID", error);
        return null;
    }
};

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

const CLOUDINARY_URL_REGEX = new RegExp(
    `^https://res\\.cloudinary\\.com/${CLOUDINARY_CLOUD_NAME}/image/upload/(v\\d+/)?[\\w\\-/.]+\\.(jpg|jpeg|png|webp)$`,
    'i'
);

function isValidCloudinaryImageUrl(url) {
    if (typeof url !== 'string') return false;
    return CLOUDINARY_URL_REGEX.test(url);
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

const deleteFromCloudinary = (publicId) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(publicId, { resource_type: 'image' }, (error, result) => {
            if (error) {
                logger.error("Cloudinary delete error", error);
                return reject(error);
            }
            resolve(result);
        });
    });
};

const deleteMultipleFromCloudinary = (publicIds) => {
    return new Promise((resolve, reject) => {
        cloudinary.api.delete_resources(publicIds, { resource_type: 'image' }, (error, result) => {
            if (error) {
                logger.error("Cloudinary delete error", error);
                return reject(error);
            }
            resolve(result);
        });
    });
};


export {
    extractPublicIdFromUrl,
    validateRealFileType,
    uploadBufferToCloudinary,
    deleteFromCloudinary,
    deleteMultipleFromCloudinary,
    isValidCloudinaryImageUrl
}