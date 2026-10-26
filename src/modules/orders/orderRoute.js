import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import verifyStore from "../../middlewares/verifyStore.js";
import requireStoreRole from "../../middlewares/requireStoreRole.js";
import { validateRequest, validateQuery, validateParams } from "../../middlewares/requestValidate.js";
import {
    CreateOrderSchema,
    ListOrdersQuerySchema,
    OrderIdSchema,
    UpdateOrderSummarySchema,
    UpdateOrderCustomerSchema,
    UpdateOrderStatusSchema
} from "./orderValidation.js";
import {
    createOrderController,
    getOrdersController,
    getOrderController,
    updateOrderSummaryController,
    updateOrderCustomerController,
    updateOrderStatusController
} from "./orderController.js";

const orderRouter = Router();

orderRouter.use(authenticateUser, verifyStore);

orderRouter.post(
    "/",
    requireStoreRole("OWNER", "MANAGER", "ORDER_MANAGER"),
    validateRequest(CreateOrderSchema),
    createOrderController
);

orderRouter.get(
    "/",
    requireStoreRole("OWNER", "MANAGER", "ORDER_MANAGER"),
    validateQuery(ListOrdersQuerySchema),
    getOrdersController
);

orderRouter.get(
    "/:orderId",
    requireStoreRole("OWNER", "MANAGER", "ORDER_MANAGER"),
    validateParams(OrderIdSchema),
    getOrderController
);

orderRouter.patch(
    "/:orderId/summary",
    requireStoreRole("OWNER", "MANAGER", "ORDER_MANAGER"),
    validateParams(OrderIdSchema),
    validateRequest(UpdateOrderSummarySchema),
    updateOrderSummaryController
);

orderRouter.patch(
    "/:orderId/customer",
    requireStoreRole("OWNER", "MANAGER", "ORDER_MANAGER"),
    validateParams(OrderIdSchema),
    validateRequest(UpdateOrderCustomerSchema),
    updateOrderCustomerController
);

orderRouter.patch(
    "/:orderId/status",
    requireStoreRole("OWNER", "MANAGER", "ORDER_MANAGER"),
    validateParams(OrderIdSchema),
    validateRequest(UpdateOrderStatusSchema),
    updateOrderStatusController);

export default orderRouter;