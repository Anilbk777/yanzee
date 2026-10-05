import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import verifyStore from "../../middlewares/verifyStore.js";
import { validateRequest, validateQuery, validateParams } from "../../middlewares/requestValidate.js";
import {
    CreateStoreSchema,
    StoreIdSchema,
    UpdateStoreSchema
} from "./storeValidation.js";
import {
    createStoreController,
    getStoresController,
    getStoreByIdController,
    updateStoreByIdController,
    deleteStoreController,
    togglePublishController
} from "./storeController.js";

import requireStoreRole from "../../middlewares/requireStoreRole.js"
const storeRouter = Router();

const ownerGuard = requireStoreRole("OWNER")

// Order matters: Express matches in declaration order, so the owner's own
// "/my" routes must be registered before the public "/:shopId" detail route.
storeRouter.post("/",
    authenticateUser,
    ownerGuard,
    validateRequest(CreateStoreSchema),
    createStoreController
);

storeRouter.get("/",
    authenticateUser,
    getStoresController
);

storeRouter.get("/:storeId",
    authenticateUser,
    validateParams(StoreIdSchema),
    getStoreByIdController
);

storeRouter.patch("/",
    authenticateUser,
    ownerGuard,
    verifyStore,
    validateRequest(UpdateStoreSchema),
    updateStoreByIdController
)

storeRouter.delete("/",
    authenticateUser,
    ownerGuard,
    verifyStore,
    deleteStoreController
)

storeRouter.post("/toggle-publish",
    authenticateUser,
    ownerGuard,
    verifyStore,
    togglePublishController
)

export default storeRouter;
