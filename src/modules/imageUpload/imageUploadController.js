import ApiResponse from "../../utils/apiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
    uploadSingleImageService,
    uploadUserImageService,
    uploadMultipleImagesService
} from "./imageUploadService.js";


export const uploadUserImageController = asyncHandler(async (req, res) => {
    const folder = `users/${req.user.id}`;
    const result = await uploadUserImageService(req.file, folder, req.user);
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

export const uploadProductGalleryController = asyncHandler(async (req, res) => {
    const folder = `shops/${req.shop.id}/products/gallery`;
    const result = await uploadMultipleImagesService(req.files, folder);
    ApiResponse(res, result)
})