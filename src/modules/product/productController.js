import ApiResponse from "../../utils/apiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
    createProductService,
    getProductByIdService,
    listProductsService,
    updateProductByIdService,
    deleteProductByIdService,
} from "./productService.js";

export const createProductController = asyncHandler(async (req, res) => {
    const result = await createProductService(req.shop, req.body);
    ApiResponse(res, result);
});

export const getProductByIdController = asyncHandler(async (req, res) => {
    const result = await getProductByIdService(req.shop, req.params.productId);
    ApiResponse(res, result);
});

export const listProductsController = asyncHandler(async (req, res) => {
    const result = await listProductsService(req.shop, req.validatedQuery);
    ApiResponse(res, result);
});

export const updateProductByIdController = asyncHandler(async (req, res) => {
    const result = await updateProductByIdService(req.shop, req.params.productId, req.body);
    ApiResponse(res, result);
});

export const deleteProductByIdController = asyncHandler(async (req, res) => {
    const result = await deleteProductByIdService(req.shop, req.params.productId);
    ApiResponse(res, result);
});
