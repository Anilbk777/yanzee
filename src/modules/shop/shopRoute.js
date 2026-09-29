import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import requireOwner from "../../middlewares/requireOwner.js";
import requireShop from "../../middlewares/requireShop.js";
import { validateRequest, validateQuery, validateParams } from "../../middlewares/requestValidate.js";
import {
    CreateShopSchema,
    UpdateShopSchema,
    ShopIdParamsSchema,
    ListShopsQuerySchema,
} from "./shopValidation.js";
import {
    createShopController,
    getMyShopController,
    updateMyShopController,
    deleteMyShopController,
    getShopByIdController,
    listShopsController,
} from "./shopController.js";

const shopRouter = Router();

// Order matters: Express matches in declaration order, so the owner's own
// "/my" routes must be registered before the public "/:shopId" detail route.
shopRouter.post("/", authenticateUser, requireOwner, validateRequest(CreateShopSchema), createShopController);
shopRouter.get("/my", authenticateUser, requireOwner, requireShop, getMyShopController);
shopRouter.patch("/my", authenticateUser, requireOwner, requireShop, validateRequest(UpdateShopSchema), updateMyShopController);
shopRouter.delete("/my", authenticateUser, requireOwner, requireShop, deleteMyShopController);

// Public
shopRouter.get("/", validateQuery(ListShopsQuerySchema), listShopsController);
shopRouter.get("/:shopId", validateParams(ShopIdParamsSchema), getShopByIdController);

export default shopRouter;
