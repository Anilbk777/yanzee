import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import { validateRequest, validateParams } from "../../middlewares/requestValidate.js";
import {
    AddToCartSchema,
    UpdateCartItemSchema,
    CartItemIdParamsSchema,
    SelectAllSchema,
    SelectShopSchema,
} from "./cartValidation.js";
import {
    addToCartController,
    getCartController,
    getCartCountController,
    updateCartItemController,
    removeCartItemController,
    selectAllController,
    selectShopController,
    clearCartController,
} from "./cartController.js";

const cartRouter = Router();

// All cart routes require authentication
cartRouter.use(authenticateUser);

cartRouter.post("/items", validateRequest(AddToCartSchema), addToCartController);
cartRouter.get("/", getCartController);
cartRouter.get("/count", getCartCountController);
cartRouter.patch("/select-all", validateRequest(SelectAllSchema), selectAllController);
cartRouter.patch("/select-shop", validateRequest(SelectShopSchema), selectShopController);
cartRouter.patch("/items/:itemId", validateParams(CartItemIdParamsSchema), validateRequest(UpdateCartItemSchema), updateCartItemController);
cartRouter.delete("/items/:itemId", validateParams(CartItemIdParamsSchema), removeCartItemController);
cartRouter.delete("/", clearCartController);

export default cartRouter;
