import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import verifyStore from "../../middlewares/verifyStore.js";
import requireStoreRole from "../../middlewares/requireStoreRole.js";
import { validateRequest, validateParams, validateQuery } from "../../middlewares/requestValidate.js";
import {
    CreateProductSchema,
    UpdateGeneralSchema,
    UpdateInventorySchema,
    UpdateCustomSchema,
    UpdateStatusSchema,
    UpdateSeoSchema,
    ProductIdSchema,
    ListProductsQuerySchema,
} from "./productValidation.js";
import {
    createProductController,
    getProductsController,
    getProductController,
    updateGeneralController,
    updateInventoryController,
    updateCustomController,
    updateStatusController,
    updateSeoController,
    deleteProductController
} from "./productController.js";

const productRouter = Router();

const canWrite = requireStoreRole("OWNER", "MANAGER");
const canPublish = requireStoreRole("OWNER", "MANAGER"); // change to ("OWNER") if only owners may publish/archive
const productId = validateParams(ProductIdSchema);

// Every route needs a logged-in user and a valid x-store-id header
productRouter.use(authenticateUser, verifyStore);

// Read (all store members)
productRouter.get("/", validateQuery(ListProductsQuerySchema), getProductsController);
productRouter.get("/:productId", productId, getProductController);

// Create
productRouter.post("/", canWrite, validateRequest(CreateProductSchema), createProductController);

// The 5 update endpoints
productRouter.patch("/:productId/general", canWrite, productId, validateRequest(UpdateGeneralSchema), updateGeneralController);
productRouter.patch("/:productId/inventory", canWrite, productId, validateRequest(UpdateInventorySchema), updateInventoryController);
productRouter.patch("/:productId/custom", canWrite, productId, validateRequest(UpdateCustomSchema), updateCustomController);
productRouter.patch("/:productId/status", canPublish, productId, validateRequest(UpdateStatusSchema), updateStatusController);
productRouter.patch("/:productId/seo", canWrite, productId, validateRequest(UpdateSeoSchema), updateSeoController);

// Delete
productRouter.delete("/:productId", canWrite, productId, deleteProductController);

export default productRouter;