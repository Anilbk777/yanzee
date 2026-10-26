import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/apiResponse.js";
import { createOrderService, getOrdersService, getOrderService } from "./orderService.js";
import { updateOrderSummaryService, updateOrderCustomerService, updateOrderStatusService } from "./orderEditService.js";

export const createOrderController = asyncHandler(async (req, res) => {
    const actor = { id: req.userId, name: req.user?.fullName, role: req.user?.role };
    ApiResponse(res, await createOrderService(req.storeId, actor, req.body));
});

export const getOrdersController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getOrdersService(req.storeId, req.validatedQuery));
});

export const getOrderController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getOrderService(req.storeId, req.params.orderId));
});

export const updateOrderSummaryController = asyncHandler(async (req, res) => {
    const actor = { id: req.userId, name: req.user?.fullName, role: req.user?.role };
    ApiResponse(res, await updateOrderSummaryService(req.storeId, actor, req.params.orderId, req.body));
});

export const updateOrderCustomerController = asyncHandler(async (req, res) => {
    const actor = { id: req.userId, name: req.user?.fullName, role: req.user?.role };
    ApiResponse(res, await updateOrderCustomerService(req.storeId, actor, req.params.orderId, req.body));
});

export const updateOrderStatusController = asyncHandler(async (req, res) => {
    const actor = { id: req.userId, name: req.user?.fullName, role: req.user?.role };
    ApiResponse(res, await updateOrderStatusService(req.storeId, actor, req.params.orderId, req.body));
});