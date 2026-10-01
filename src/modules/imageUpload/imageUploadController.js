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
    // A shop image can legitimately be uploaded BEFORE the shop exists (the
    // create call accepts an image URL), so it goes to a per-user pending
    // folder in that case and is promoted to shops/<shopId> once there is one.
    // Both folders are recognised by the shop cleanup as belonging to this
    // owner, which keeps cross-tenant deletion impossible either way.
    const folder = req.user.shop
        ? `shops/${req.user.shop.id}`
        : `shops/pending/${req.userId}`;

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