import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import verifyStore from "../../middlewares/verifyStore.js";
import requireStoreRole from "../../middlewares/requireStoreRole.js";
import { validateRequest, validateParams, validateQuery } from "../../middlewares/requestValidate.js";
import {
    CreateOutletSchema, UpdateOutletSchema, SetOutletStatusSchema, OutletIdSchema, ListOutletsQuerySchema,
} from "./outletValidation.js";
import * as controller from "./outletController.js";

const outletRouter = Router();

const canWrite = requireStoreRole("OWNER", "MANAGER");
const canDelete = requireStoreRole("OWNER");
const outletId = validateParams(OutletIdSchema);

outletRouter.use(authenticateUser, verifyStore);

outletRouter.get("/", validateQuery(ListOutletsQuerySchema), controller.getOutletsController);
outletRouter.post("/", canWrite, validateRequest(CreateOutletSchema), controller.createOutletController);

outletRouter.get("/:outletId", outletId, controller.getOutletController);
outletRouter.patch("/:outletId", canWrite, outletId, validateRequest(UpdateOutletSchema), controller.updateOutletController);
outletRouter.patch("/:outletId/toggle-status", canWrite, outletId, controller.setOutletStatusController);
outletRouter.delete("/:outletId", canDelete, outletId, controller.deleteOutletController);

export default outletRouter;