import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import requireOwner from "../../middlewares/requireOwner.js";
import requireShop from "../../middlewares/requireShop.js";
import verifyShopHeader from "../../middlewares/verifyShopHeader.js";
import { validateRequest, validateQuery, validateParams } from "../../middlewares/requestValidate.js";
import {
    CreateProductSchema,
    UpdateProductSchema,
    ProductIdParamsSchema,
    ListProductsQuerySchema,
} from "./productValidation.js";
import {
    createProductController,
    getProductByIdController,
    listProductsController,
    updateProductByIdController,
    deleteProductByIdController,
    getPublicProductsController
} from "./productController.js";

const productRouter = Router();

const ownerOnly = [authenticateUser, requireOwner];

productRouter.post("/", ...ownerOnly, validateRequest(CreateProductSchema), createProductController);
productRouter.get("/", ...ownerOnly, validateQuery(ListProductsQuerySchema), listProductsController);
productRouter.get("/public", validateQuery(ListProductsQuerySchema), getPublicProductsController);
productRouter.get("/:productId", ...ownerOnly, validateParams(ProductIdParamsSchema), getProductByIdController);
productRouter.patch("/:productId", ...ownerOnly, validateParams(ProductIdParamsSchema), validateRequest(UpdateProductSchema), updateProductByIdController);
productRouter.delete("/:productId", ...ownerOnly, validateParams(ProductIdParamsSchema), deleteProductByIdController);

export default productRouter;
