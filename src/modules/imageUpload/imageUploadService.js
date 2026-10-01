import {
    validateRealFileType,
    uploadBufferToCloudinary,
    deleteImagesSafely,
    maxImagesPerUpload,
    deleteFromCloudinary,
} from "../../utils/imageUpload.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { updateUserImage, getUserProfileImg } from "./imageUploadModel.js";

// Every buffer is checked before the first byte reaches Cloudinary. Uploading
// concurrently while validating (Promise.all over upload+validate) meant an
// invalid file at position 3 left files 1 and 2 uploaded but orphaned.
const validateAllFiles = async (files) => {
    for (const file of files) {
        await validateRealFileType(file.buffer);
    }
};

// Cloudinary has no transaction, so a failed multi-upload has to be undone by
// hand: whatever was already uploaded is destroyed before the error propagates.
const uploadAllOrRollback = async (files, folder) => {
    const uploaded = [];

    try {
        for (const file of files) {
            const result = await uploadBufferToCloudinary(file.buffer, folder);
            uploaded.push(result);
        }
        return uploaded;
    } catch (error) {
        if (uploaded.length > 0) {
            logger.error({ count: uploaded.length, folder }, "Rolling back partially uploaded images");
            await deleteImagesSafely({
                currentUrls: uploaded.map((item) => item.secure_url),
                nextUrls: [],
            });
        }
        throw error;
    }
};

const uploadUserImageService = async (file, folder, user) => {
    logger.info("Upload user image started");

    if (!file) {
        throw new AppError("No file provided", constants.BadRequest);
    }
    await validateRealFileType(file.buffer);


    const cloudinaryResult = await uploadBufferToCloudinary(file.buffer, folder);

    if (user.profileImg) {
        await deleteFromCloudinary(user.profileImg);
    }

    const updatedUser = await updateUserImage(user.id, cloudinaryResult.secure_url);

    logger.info("Upload user image completed");
    return {
        statusCode: 200,
        message: "Image uploaded successfully",
        data: {
            id: updatedUser.id,
            fullName: updatedUser.fullName,
            role: updatedUser.role,
            profileImg: updatedUser.profileImg,
        }
    }
}

const uploadSingleImageService = async (file, folder) => {
    logger.info("Upload single image started");

    if (!file) {
        throw new AppError("No file provided", constants.BadRequest);
    }
    await validateRealFileType(file.buffer);
    const cloudinaryResult = await uploadBufferToCloudinary(file.buffer, folder);

    logger.info("Upload single image completed");
    return {
        statusCode: 200,
        message: "Image uploaded successfully",
        data: {
            url: cloudinaryResult.secure_url,
            publicId: cloudinaryResult.public_id,
        }
    }
}

const uploadMultipleImagesService = async (files, folder) => {
    logger.info("Upload multiple images started");

    if (!files || files.length === 0) {
        throw new AppError("No files provided", constants.BadRequest);
    }

    // multer already caps the count; this keeps the rule true for any caller
    // that reaches the service directly.
    if (files.length > maxImagesPerUpload) {
        throw new AppError(`You can upload at most ${maxImagesPerUpload} images at a time`, constants.BadRequest);
    }

    await validateAllFiles(files);
    const cloudinaryResults = await uploadAllOrRollback(files, folder);

    logger.info("Upload multiple images completed");
    return {
        statusCode: 200,
        message: "Images uploaded successfully",
        data: {
            urls: cloudinaryResults.map((result) => result.secure_url),
            publicIds: cloudinaryResults.map((result) => result.public_id),
        }
    }
}


export {
    uploadUserImageService,
    uploadSingleImageService,
    uploadMultipleImagesService
}