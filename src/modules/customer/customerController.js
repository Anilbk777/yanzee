import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/apiResponse.js";
import {
    createCustomerService,
    getAllCustomersService,
    getCustomerByIdService,
    updateCustomerService,
    deleteCustomerService
} from "./customerService.js"

export const createCustomerController = asyncHandler(async (req, res) => {
    ApiResponse(res, await createCustomerService(req.storeId, req.body));
});

export const getAllCustomersController = asyncHandler(async (req, res) => {
    const { search, page, limit } = req.validatedQuery;
    ApiResponse(res, await getAllCustomersService(req.storeId, search, page, limit));
});

export const getCustomerByIdController = asyncHandler(async (req, res) => {
    ApiResponse(res, await getCustomerByIdService(req.storeId, req.params.customerId));
});

export const updateCustomerController = asyncHandler(async (req, res) => {
    ApiResponse(res, await updateCustomerService(req.storeId, req.params.customerId, req.body));
});

export const deleteCustomerController = asyncHandler(async (req, res) => {
    ApiResponse(res, await deleteCustomerService(req.storeId, req.params.customerId));
});