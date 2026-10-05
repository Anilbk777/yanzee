import ApiResponse from "../../utils/apiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
    uploadImageService,
    uploadStoreImageService
} from "./imageUploadService.js";

export const uploadImageController = asyncHandler(async (req, res) => {
    const response = await uploadImageService(req.file, req.storeId, req.params.entityType);
    ApiResponse(res, response);
});

export const uploadStoreImageController = asyncHandler(async (req, res) => {
    const response = await uploadStoreImageService(req.file, req.store);
    ApiResponse(res, response);
});
