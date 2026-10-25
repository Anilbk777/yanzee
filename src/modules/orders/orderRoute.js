import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import verifyStore from "../../middlewares/verifyStore.js";
import requireStoreRole from "../../middlewares/requireStoreRole.js";
import { validateRequest, validateQuery, validateParams } from "../../middlewares/requestValidate.js";
import { CreateOrderSchema, ListOrdersQuerySchema, OrderIdSchema } from "./orderValidation.js";
import { createOrderController, getOrdersController, getOrderController } from "./orderController.js";

const orderRouter = Router();

orderRouter.use(authenticateUser, verifyStore);

orderRouter.post("/", requireStoreRole("OWNER", "MANAGER", "ORDER_MANAGER"), validateRequest(CreateOrderSchema), createOrderController);

orderRouter.get("/", requireStoreRole("OWNER", "MANAGER", "ORDER_MANAGER"), validateQuery(ListOrdersQuerySchema), getOrdersController);

orderRouter.get("/:orderId", requireStoreRole("OWNER", "MANAGER", "ORDER_MANAGER"), validateParams(OrderIdSchema), getOrderController);

export default orderRouter;