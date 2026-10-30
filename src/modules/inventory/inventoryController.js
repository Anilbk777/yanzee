import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/apiResponse.js";
import { stockInService,getMovementsService ,getStockService , getItemBatchesService, getInventoryOverviewService} from "./inventoryService.js";

export const stockInController = asyncHandler(async (req, res) => {
    ApiResponse(res, await stockInService(req.storeId, req.userId, req.body));
});

export const getMovementsController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getMovementsService(req.storeId, req.validatedQuery));
});

export const getStockController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getStockService(req.storeId, req.validatedQuery));
});

export const getItemBatchesController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getItemBatchesService(req.storeId, req.params.productId, req.validatedQuery));
});

export const getInventoryOverviewController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getInventoryOverviewService(req.storeId, req.validatedQuery));
});