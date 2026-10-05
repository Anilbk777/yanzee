import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import verifyStore from "../../middlewares/verifyStore.js";
import requireStoreRole from "../../middlewares/requireStoreRole.js";
import { validateRequest, validateParams, validateQuery } from "../../middlewares/requestValidate.js";
import {
    CreateBrandSchema,
    UpdateBrandSchema,
    SetBrandAvailabilitySchema,
    BrandIdSchema,
    ListBrandsQuerySchema,
} from "./brandValidation.js";
import {
    createBrandController,
    getBrandsController,
    getBrandController,
    updateBrandController,
    setBrandAvailabilityController,
    deleteBrandController,
} from "./brandController.js";

const brandRouter = Router();
const canWrite = requireStoreRole("OWNER", "MANAGER");

brandRouter.use(authenticateUser, verifyStore);

brandRouter.get("/", validateQuery(ListBrandsQuerySchema), getBrandsController);
brandRouter.post("/", canWrite, validateRequest(CreateBrandSchema), createBrandController);

brandRouter.get("/:brandId", validateParams(BrandIdSchema), getBrandController);
brandRouter.patch("/:brandId", canWrite, validateParams(BrandIdSchema), validateRequest(UpdateBrandSchema), updateBrandController);
brandRouter.post("/:brandId/toggle-availability", canWrite, validateParams(BrandIdSchema), setBrandAvailabilityController);
brandRouter.delete("/:brandId", canWrite, validateParams(BrandIdSchema), deleteBrandController);

export default brandRouter;