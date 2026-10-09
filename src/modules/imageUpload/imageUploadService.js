import { v2 as cloudinary } from "cloudinary";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { updateStoreLogoModel } from "./imageUploadModel.js";
import {
  validateRealFileType,
  uploadTempImage,
  uploadImage,
} from "../../utils/imageUpload.js";


const uploadStoreImageService = async (file, store) => {
  logger.info({ storeId: store.id }, "store logo uploading")
  if (!file) throw new AppError("No file provided", constants.BadRequest);
  await validateRealFileType(file.buffer);

  const uploaded = await uploadImage(file.buffer, store.id, "logos");

  let updated;
  try {
    updated = await updateStoreLogoModel(store.id, uploaded.secure_url);
  } catch (error) {
    // DB write failed, so don't leave an orphan in Cloudinary
    await cloudinary.uploader
      .destroy(uploaded.public_id, { invalidate: true })
      .catch((err) => logger.error({ err, publicId: uploaded.public_id }, "Failed to roll back logo upload"));
    throw error;
  }

  // DB succeeded, so remove the previous logo (best effort, never blocks the response)
  if (store.logo) deleteImageByUrl(store.logo, store.id, "logos");

  logger.info({ storeId: store.id }, "Store logo updated");

  return {
    statusCode: 200,
    message: "Store logo updated successfully",
    data: { store: updated },
  };
};

const uploadImageService = async (file, storeId, entityType) => {
  logger.info("Upload image started");
  if (!file) throw new AppError("No file provided", constants.BadRequest);
  await validateRealFileType(file.buffer);

  const result = await uploadTempImage(file.buffer, storeId, entityType);

  return {
    statusCode: 200,
    message: "Image uploaded successfully",
    data: { url: result.secure_url },
  };
};

export {
  uploadStoreImageService,
  uploadImageService,
};
