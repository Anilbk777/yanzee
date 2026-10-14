import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import verifyStore from "../../middlewares/verifyStore.js";
import requireStoreRole from "../../middlewares/requireStoreRole.js";
import { validateRequest, validateQuery, validateParams } from "../../middlewares/requestValidate.js";
import {
    createCustomerController,
    getAllCustomersController,
    getCustomerByIdController,
    updateCustomerController,
    deleteCustomerController
} from "./customerController.js"
import {
    createCustomerSchema,
    updateCustomerSchema,
    customerIdSchema,
    ListCustomerQuerySchema
} from "./customerValidation.js"

const customerRouter = Router();
customerRouter.use(authenticateUser, verifyStore);

customerRouter.post(
    "/",
    requireStoreRole("OWNER", "MANAGER"),
    validateRequest(createCustomerSchema),
    createCustomerController
);

customerRouter.get(
    "/",
    requireStoreRole("OWNER", "MANAGER", "VIEWER"),
    validateQuery(ListCustomerQuerySchema),
    getAllCustomersController
);

customerRouter.get(
    "/:customerId",
    requireStoreRole("OWNER", "MANAGER", "VIEWER"),
    validateParams(customerIdSchema),
    getCustomerByIdController
);

customerRouter.patch(
    "/:customerId",
    requireStoreRole("OWNER", "MANAGER"),
    validateParams(customerIdSchema),
    validateRequest(updateCustomerSchema),
    updateCustomerController
);

customerRouter.delete(
    "/:customerId",
    requireStoreRole("OWNER", "MANAGER"),
    validateParams(customerIdSchema),
    deleteCustomerController
);

export default customerRouter;
