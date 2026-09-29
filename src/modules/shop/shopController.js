import ApiResponse from "../../utils/apiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
    createShopService,
    getMyShopService,
    updateMyShopService,
    deleteMyShopService,
    getShopByIdService,
    listShopsService,
} from "./shopService.js";

export const createShopController = asyncHandler(async (req, res) => {
    const result = await createShopService(req.userId, req.body);
    ApiResponse(res, result);
});

export const getMyShopController = asyncHandler(async (req, res) => {
    const result = await getMyShopService(req.shop);
    ApiResponse(res, result);
});

export const updateMyShopController = asyncHandler(async (req, res) => {
    const result = await updateMyShopService(req.shop, req.body);
    ApiResponse(res, result);
});

export const deleteMyShopController = asyncHandler(async (req, res) => {
    const result = await deleteMyShopService(req.shop);
    ApiResponse(res, result);
});

export const getShopByIdController = asyncHandler(async (req, res) => {
    const result = await getShopByIdService(req.params.shopId);
    ApiResponse(res, result);
});

export const listShopsController = asyncHandler(async (req, res) => {
    const { page, limit, search } = req.validatedQuery;
    const result = await listShopsService({ page, limit, search });
    ApiResponse(res, result);
});
