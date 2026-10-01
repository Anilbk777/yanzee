import {
    validateRealFileType,
    uploadBufferToCloudinary
} from "../../utils/imageUpload.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { updateUserImage, updateShopImage } from "./imageUploadModel.js";

const uploadUserImageService = async (file, folder, userId) => {
    logger.info('Upload user image started');

    if (!file) {
        throw new AppError("No file provided", constants.BadRequest);
    }
    await validateRealFileType(file.buffer);
    const cloudinaryResult = await uploadBufferToCloudinary(file.buffer, folder);
    const user = await updateUserImage(userId, cloudinaryResult.secure_url);

    logger.info('Upload user image completed');
    return {
        statusCode: 200,
        message: "Image uploaded successfully",
        data: {
            id: user.id,
            name: user.name,
            role: user.role,
            profileImage: user.profileImg
        }
    }
}

const uploadSingleImageService = async (file, folder) => {
    logger.info('Upload single image started');

    if (!file) {
        throw new AppError("No file provided", constants.BadRequest);
    }
    await validateRealFileType(file.buffer);
    const cloudinaryResult = await uploadBufferToCloudinary(file.buffer, folder);

    logger.info('Upload single image completed');
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
    logger.info('Upload multiple images started');

    if (!files || files.length === 0) {
        throw new AppError("No files provided", constants.BadRequest);
    }

    const uploadPromises = files.map(async (file) => {
        await validateRealFileType(file.buffer);
        return uploadBufferToCloudinary(file.buffer, folder);
    });

    const cloudinaryResults = await Promise.all(uploadPromises);
    logger.info('Upload multiple images completed');
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