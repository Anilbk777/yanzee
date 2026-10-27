import { v2 as cloudinary } from "cloudinary";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import logger from "../../utils/logger.js";
import { updateStoreLogoModel, getStoreLogoModel } from "./imageUploadModel.js";
import {
  validateRealFileType,
  uploadTempImage,
  uploadImage,
  deleteImageByUrl
} from "../../utils/imageUpload.js";


const uploadStoreImageService = async (file, storeId) => {
  logger.info({ storeId }, "store logo uploading");
  if (!file) throw new AppError("No file provided", constants.BadRequest);
  await validateRealFileType(file.buffer);

  // Fetch current logo and upload the new image concurrently
  const [current, uploaded] = await Promise.all([
    getStoreLogoModel(storeId),
    uploadImage(file.buffer, storeId, "logos"),
  ]);
  const oldLogo = current?.logo ?? null;

  let updated;
  try {
    updated = await updateStoreLogoModel(storeId, uploaded.secure_url);
  } catch (error) {
    // DB write failed, so don't leave an orphan in Cloudinary
    await cloudinary.uploader
      .destroy(uploaded.public_id, { invalidate: true })
      .catch((err) => logger.error({ err, publicId: uploaded.public_id }, "Failed to roll back logo upload"));
    throw error;
  }

  // DB succeeded — delete the old logo from Cloudinary (best-effort, never blocks response)
  if (oldLogo) deleteImageByUrl(oldLogo);

  logger.info({ storeId }, "Store logo updated");

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
    // data: { url: result.secure_url, processed: result.eager?.[0]?.secure_url },
  };
};

export {
  uploadStoreImageService,
  uploadImageService,
};
