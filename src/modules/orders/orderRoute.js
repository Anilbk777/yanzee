import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import requireOwner from "../../middlewares/requireOwner.js";
import requireShop from "../../middlewares/requireShop.js";
import verifyShopHeader from "../../middlewares/verifyShopHeader.js";
import { validateRequest, validateQuery, validateParams } from "../../middlewares/requestValidate.js";
import {
    CheckoutSchema,
    CancelOrderSchema,
    UpdateOrderStatusSchema,
    OrderIdParamsSchema,
    ListOrdersQuerySchema,
} from "./orderValidation.js";
import {
    checkoutPreviewController,
    checkoutController,
    listMyOrdersController,
    getMyOrderController,
    cancelOrderController,
    listShopOrdersController,
    getShopOrderController,
    updateOrderStatusController,
} from "./orderController.js";

const orderRouter = Router();

const customerOnly = [authenticateUser];
const shopOnly = [authenticateUser, requireOwner];

// ---- shop owner ----
// Registered before "/:orderId" so the literal "shop" segment is not swallowed
// by the order-id route and rejected as a bad uuid.
orderRouter.get("/shop", ...shopOnly, validateQuery(ListOrdersQuerySchema), listShopOrdersController);
orderRouter.get("/shop/:orderId", ...shopOnly, validateParams(OrderIdParamsSchema), getShopOrderController);
orderRouter.patch("/shop/:orderId/status", ...shopOnly, validateParams(OrderIdParamsSchema), validateRequest(UpdateOrderStatusSchema), updateOrderStatusController);

// ---- customer ----
orderRouter.get("/checkout/preview", ...customerOnly, checkoutPreviewController);
orderRouter.post("/checkout", ...customerOnly, validateRequest(CheckoutSchema), checkoutController);
// orderRouter.post("/", ...customerOnly, validateRequest(CheckoutSchema), checkoutController);
orderRouter.get("/", ...customerOnly, validateQuery(ListOrdersQuerySchema), listMyOrdersController);
orderRouter.get("/:orderId", ...customerOnly, validateParams(OrderIdParamsSchema), getMyOrderController);
orderRouter.post("/:orderId/cancel", ...customerOnly, validateParams(OrderIdParamsSchema), validateRequest(CancelOrderSchema), cancelOrderController);

export default orderRouter;
