import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/apiResponse.js";
import * as service from "./outletService.js";

export const createOutletController = asyncHandler(async (req, res) => {
    ApiResponse(res, await service.createOutletService(req.storeId, req.body));
});

export const getOutletsController = asyncHandler(async (req, res) => {
    ApiResponse(res, await service.getOutletsService(req.storeId, req.validatedQuery));
});

export const getOutletController = asyncHandler(async (req, res) => {
    ApiResponse(res, await service.getOutletService(req.storeId, req.params.outletId));
});

export const updateOutletController = asyncHandler(async (req, res) => {
    ApiResponse(res, await service.updateOutletService(req.storeId, req.params.outletId, req.body));
});

export const setOutletStatusController = asyncHandler(async (req, res) => {
    ApiResponse(res, await service.setOutletStatusService(req.storeId, req.params.outletId));
});

export const deleteOutletController = asyncHandler(async (req, res) => {
    ApiResponse(res, await service.deleteOutletService(req.storeId, req.params.outletId));
});