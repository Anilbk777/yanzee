import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/apiResponse.js";
import {
    createProductService,
    getProductsService,
    getProductService,
    updateGeneralService,
    updateInventoryService,
    updateCustomService,
    updateStatusService,
    updateSeoService,
    deleteProductService
} from "./productService.js";

export const createProductController = asyncHandler(async (req, res) => {
    ApiResponse(res, await createProductService(req.storeId, req.body));
});

export const getProductsController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getProductsService(req.storeId, req.validatedQuery));
});

export const getProductController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getProductService(req.storeId, req.params.productId));
});

export const updateGeneralController = asyncHandler(async (req, res) => {
    ApiResponse(res, await updateGeneralService(req.storeId, req.params.productId, req.body));
});

export const updateInventoryController = asyncHandler(async (req, res) => {
    ApiResponse(res, await updateInventoryService(req.storeId, req.params.productId, req.body));
});

export const updateCustomController = asyncHandler(async (req, res) => {
    ApiResponse(res, await updateCustomService(req.storeId, req.params.productId, req.body));
});

export const updateStatusController = asyncHandler(async (req, res) => {
    ApiResponse(res, await updateStatusService(req.storeId, req.params.productId, req.body));
});

export const updateSeoController = asyncHandler(async (req, res) => {
    ApiResponse(res, await updateSeoService(req.storeId, req.params.productId, req.body));
});

export const deleteProductController = asyncHandler(async (req, res) => {
    ApiResponse(res, await deleteProductService(req.storeId, req.params.productId));
});