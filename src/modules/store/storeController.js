import ApiResponse from "../../utils/apiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
    createStoreService,
    getStoreByIdService,
    getStoresService,
    updateStoreDetailService,
    deleteStoreService,
    togglePublishService
} from "./storeService.js";

export const createStoreController = asyncHandler(async (req, res) => {
    const result = await createStoreService(req.userId, req.body);
    ApiResponse(res, result);
});

export const getStoresController = asyncHandler(async (req, res) => {
    const result = await getStoresService(req.userId);
    ApiResponse(res, result);
});

export const getStoreByIdController = asyncHandler(async (req, res) => {
    const result = await getStoreByIdService(req.userId, req.params.storeId);
    ApiResponse(res, result);
});

export const updateStoreByIdController = asyncHandler(async (req, res) => {
    const result = await updateStoreDetailService(req.userId, req.storeId, req.body);
    ApiResponse(res, result);
})

export const deleteStoreController = asyncHandler(async (req, res) => {
    const result = await deleteStoreService(req.userId, req.storeId);
    ApiResponse(res, result);
})
export const togglePublishController = asyncHandler(async (req, res) => {
    const result = await togglePublishService(req.userId, req.store);
    ApiResponse(res, result);
})
