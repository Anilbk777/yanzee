import ApiResponse from "../../utils/apiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
    checkoutPreviewService,
    checkoutService,
    listMyOrdersService,
    getMyOrderService,
    cancelOrderService,
    listShopOrdersService,
    getShopOrderService,
    updateOrderStatusService,
} from "./orderService.js";

// ---- customer ----

export const checkoutPreviewController = asyncHandler(async (req, res) => {
    const result = await checkoutPreviewService(req.userId);
    ApiResponse(res, result);
});

export const checkoutController = asyncHandler(async (req, res) => {
    const result = await checkoutService(req.user, req.body);
    ApiResponse(res, result);
});

export const listMyOrdersController = asyncHandler(async (req, res) => {
    const result = await listMyOrdersService(req.userId, req.validatedQuery);
    ApiResponse(res, result);
});

export const getMyOrderController = asyncHandler(async (req, res) => {
    const result = await getMyOrderService(req.userId, req.params.orderId);
    ApiResponse(res, result);
});

export const cancelOrderController = asyncHandler(async (req, res) => {
    const result = await cancelOrderService(req.userId, req.params.orderId, req.body);
    ApiResponse(res, result);
});

// ---- shop owner ----

export const listShopOrdersController = asyncHandler(async (req, res) => {
    const result = await listShopOrdersService(req.shop, req.validatedQuery);
    ApiResponse(res, result);
});

export const getShopOrderController = asyncHandler(async (req, res) => {
    const result = await getShopOrderService(req.shop, req.params.orderId);
    ApiResponse(res, result);
});

export const updateOrderStatusController = asyncHandler(async (req, res) => {
    const result = await updateOrderStatusService(req.shop, req.params.orderId, req.body);
    ApiResponse(res, result);
});
