import ApiResponse from "../../utils/apiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
    createCategoryService,
    getCategoriesService,
    getCategoryService,
    updateCategoryService,
    setCategoryAvailabilityService,
    deleteCategoryService,
} from "./categoryService.js";

export const createCategoryController = asyncHandler(async (req, res) => {
    const response = await createCategoryService(req.storeId, req.body);
    ApiResponse(res, response);
});

export const getCategoriesController = asyncHandler(async (req, res) => {
    const response = await getCategoriesService(req.storeId, req.validatedQuery);
    ApiResponse(res, response);
});

export const getCategoryController = asyncHandler(async (req, res) => {
    const response = await getCategoryService(req.storeId, req.params.categoryId);
    ApiResponse(res, response);
});

export const updateCategoryController = asyncHandler(async (req, res) => {
    const response = await updateCategoryService(req.storeId, req.params.categoryId, req.body);
    ApiResponse(res, response);
});

export const setCategoryAvailabilityController = asyncHandler(async (req, res) => {
    const response = await setCategoryAvailabilityService(req.storeId, req.params.categoryId);
    ApiResponse(res, response);
});

export const deleteCategoryController = asyncHandler(async (req, res) => {
    const response = await deleteCategoryService(req.storeId, req.params.categoryId);
    ApiResponse(res, response);
});