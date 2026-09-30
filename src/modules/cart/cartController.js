import ApiResponse from "../../utils/apiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
    addToCartService,
    getCartService,
    updateCartItemService,
    removeCartItemService,
    selectAllService,
    selectShopService,
    clearCartService,
    getCartCountService,
} from "./cartService.js";

export const addToCartController = asyncHandler(async (req, res) => {
    const result = await addToCartService(req.userId, req.body);
    ApiResponse(res, result);
});

export const getCartController = asyncHandler(async (req, res) => {
    const result = await getCartService(req.userId);
    ApiResponse(res, result);
});

export const getCartCountController = asyncHandler(async (req, res) => {
    const result = await getCartCountService(req.userId);
    ApiResponse(res, result);
});

export const updateCartItemController = asyncHandler(async (req, res) => {
    const result = await updateCartItemService(req.userId, req.params.itemId, req.body);
    ApiResponse(res, result);
});

export const removeCartItemController = asyncHandler(async (req, res) => {
    const result = await removeCartItemService(req.userId, req.params.itemId);
    ApiResponse(res, result);
});

export const selectAllController = asyncHandler(async (req, res) => {
    const result = await selectAllService(req.userId, req.body.isSelected);
    ApiResponse(res, result);
});

export const selectShopController = asyncHandler(async (req, res) => {
    const result = await selectShopService(req.userId, req.body.shopId, req.body.isSelected);
    ApiResponse(res, result);
});

export const clearCartController = asyncHandler(async (req, res) => {
    const result = await clearCartService(req.userId);
    ApiResponse(res, result);
});
