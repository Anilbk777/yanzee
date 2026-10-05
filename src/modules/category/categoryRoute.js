import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import verifyStore from "../../middlewares/verifyStore.js";
import requireStoreRole from "../../middlewares/requireStoreRole.js";
import { validateRequest, validateParams, validateQuery } from "../../middlewares/requestValidate.js";
import {
    CreateCategorySchema,
    UpdateCategorySchema,
    SetAvailabilitySchema,
    CategoryIdSchema,
    ListCategoriesQuerySchema,
} from "./categoryValidation.js";
import {
    createCategoryController,
    getCategoriesController,
    getCategoryController,
    updateCategoryController,
    setCategoryAvailabilityController,
    deleteCategoryController,
} from "./categoryController.js";

const categoryRouter = Router();
const canWrite = requireStoreRole("OWNER", "MANAGER");

categoryRouter.use(authenticateUser, verifyStore);

categoryRouter.get("/", validateQuery(ListCategoriesQuerySchema), getCategoriesController);
categoryRouter.post("/", canWrite, validateRequest(CreateCategorySchema), createCategoryController);

categoryRouter.get("/:categoryId", validateParams(CategoryIdSchema), getCategoryController);
categoryRouter.patch("/:categoryId", canWrite, validateParams(CategoryIdSchema), validateRequest(UpdateCategorySchema), updateCategoryController);
categoryRouter.patch("/:categoryId/availability", canWrite, validateParams(CategoryIdSchema), validateRequest(SetAvailabilitySchema), setCategoryAvailabilityController);
categoryRouter.delete("/:categoryId", canWrite, validateParams(CategoryIdSchema), deleteCategoryController);

export default categoryRouter;