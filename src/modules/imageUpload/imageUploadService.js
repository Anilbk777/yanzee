import {
  validateRealFileType,
  uploadBufferToCloudinary,
  deleteFromCloudinary,
} from "../../utils/imageUpload.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { updateUserImage, getUserProfileImg } from "./imageUploadModel.js";

const validateAllFiles = async (files) => {
  for (const file of files) {
    await validateRealFileType(file.buffer);
  }
};

const uploadUserImageService = async (file, folder, user) => {
  logger.info("Upload user image started");

  if (!file) {
    throw new AppError("No file provided", constants.BadRequest);
  }
  await validateRealFileType(file.buffer);

  const cloudinaryResult = await uploadBufferToCloudinary(file.buffer, folder);

  const updatedUser = await updateUserImage(
    user.id,
    cloudinaryResult.secure_url,
  );
  if (user.profileImg) {
    await deleteFromCloudinary(user.profileImg);
  }

  logger.info("Upload user image completed");
  return {
    statusCode: 200,
    message: "Image uploaded successfully",
    data: {
      id: updatedUser.id,
      fullName: updatedUser.fullName,
      role: updatedUser.role,
      profileImg: updatedUser.profileImg,
    },
  };
};

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
    },
  };
};

const uploadMultipleImagesService = async (files, folder) => {
  logger.info("Upload multiple images started");

  if (!files || files.length === 0) {
    throw new AppError("No files provided", constants.BadRequest);
  }

  // multer already caps the count; this keeps the rule true for any caller
  // that reaches the service directly.
  if (files.length > maxImagesPerUpload) {
    throw new AppError(
      `You can upload at most ${maxImagesPerUpload} images at a time`,
      constants.BadRequest,
    );
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
    },
  };
};

export {
  uploadUserImageService,
  uploadSingleImageService,
  uploadMultipleImagesService,
};
