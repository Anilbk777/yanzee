import ApiResponse from "../../utils/apiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
    uploadSingleImageService,
    uploadUserImageService,
} from "./imageUploadService.js";


export const uploadUserImageController = asyncHandler(async (req, res) => {
    const folder = `users/${req.user.id}`;
    const result = await uploadUserImageService(req.file, folder, req.user.id);
    ApiResponse(res, result)
})

export const uploadShopImageController = asyncHandler(async (req, res) => {
    const folder = `shops`;
    const result = await uploadSingleImageService(req.file, folder);
    
    ApiResponse(res, result)
})

export const uploadProductImageController = asyncHandler(async (req, res) => {
    const folder = `shops/${req.shop.id}/products`;
    const result = await uploadSingleImageService(req.file, folder);
    
    ApiResponse(res, result)
})
