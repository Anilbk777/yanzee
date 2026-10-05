import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/apiResponse.js";
import {
    createBrandService,
    getBrandsService,
    getBrandService,
    updateBrandService,
    setBrandAvailabilityService,
    deleteBrandService,
} from "./brandService.js";

export const createBrandController = asyncHandler(async (req, res) => {
    ApiResponse(res, await createBrandService(req.storeId, req.body));
});

export const getBrandsController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getBrandsService(req.storeId, req.validatedQuery));
});

export const getBrandController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getBrandService(req.storeId, req.params.brandId));
});

export const updateBrandController = asyncHandler(async (req, res) => {
    ApiResponse(res, await updateBrandService(req.storeId, req.params.brandId, req.body));
});

export const setBrandAvailabilityController = asyncHandler(async (req, res) => {
    ApiResponse(res, await setBrandAvailabilityService(req.storeId, req.params.brandId));
});

export const deleteBrandController = asyncHandler(async (req, res) => {
    ApiResponse(res, await deleteBrandService(req.storeId, req.params.brandId));
});