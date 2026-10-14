import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import {
    createCustomerModel,
    getCustomerByIdModel,
    getAllCustomersModel,
    updateCustomerModel,
    deleteCustomerModel,
    findCustomerByNumber
} from "./customerModel.js"

export const createCustomerService = async (storeId, data) => {
    logger.info({ storeId, phoneNumber: data.phone }, "Creating customer")
    const existingCustomer = await findCustomerByNumber(storeId, data.phone);
    if (existingCustomer) {
        throw new AppError(`Customer with phone number ${data.phone} already exists`, constants.Conflict);
    }
    const customer = await createCustomerModel(storeId, data);
    logger.info({ storeId, customerId: customer.id }, "Customer created successfully")
    return {
        success: true,
        message: "Customer created Successfully",
        data: customer
    }
}

export const updateCustomerService = async (storeId, customerId, data) => {
    logger.info({ storeId, customerId }, "Updating customer")
    const existingCustomer = await getCustomerByIdModel(storeId, customerId);
    if (!existingCustomer) {
        throw new AppError("Customer not found", constants.NotFound);
    }
    if (data.phone && data.phone !== existingCustomer.phone) {
        const existingCustomerByNumber = await findCustomerByNumber(storeId, data.phone);
        if (existingCustomerByNumber) {
            throw new AppError(`Customer with phone number ${data.phone} already exists`, constants.Conflict);
        }
    }

    const customer = await updateCustomerModel(storeId, customerId, data);
    logger.info({ storeId, customerId: customer.id }, "Customer updated successfully")
    return {
        success: true,
        message: "Customer updated Successfully",
        data: customer
    }
}

export const deleteCustomerService = async (storeId, customerId) => {
    logger.info({ storeId, customerId }, "Deleting customer")
    const existingCustomer = await getCustomerByIdModel(storeId, customerId);
    if (!existingCustomer) {
        throw new AppError("Customer not found", constants.NotFound);
    }
    const customer = await deleteCustomerModel(storeId, customerId);
    logger.info({ storeId, customerId: customer.id }, "Customer deleted successfully")
    return {
        success: true,
        message: "Customer deleted Successfully",
        data: customer
    }
}

export const getAllCustomersService = async (storeId, search, page = 1, limit = 10) => {
    logger.info({ storeId, search, page, limit }, "Getting all customers")
    const { customers, totalCount } = await getAllCustomersModel(storeId, search, page, limit);
    logger.info({ storeId }, "Customers fetched successfully")
    return {
        success: true,
        message: "Customers fetched Successfully",
        data: { customers, pagination: { page, limit, totalCount } }
    }
}

export const getCustomerByIdService = async (storeId, customerId) => {
    logger.info({ storeId, customerId }, "Getting customer by id")
    const customer = await getCustomerByIdModel(storeId, customerId);
    if (!customer) {
        throw new AppError("Customer not found", constants.NotFound);
    }
    logger.info({ storeId, customerId: customer.id }, "Customer fetched successfully")
    return {
        success: true,
        message: "Customer fetched Successfully",
        data: customer
    }
}
