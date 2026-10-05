import { Router } from "express";

import authenticateUser from "../../middlewares/authenticate.js";
import requireStoreRole from "../../middlewares/requireStoreRole.js";
import verifyStore from "../../middlewares/verifyStore.js";
import { validateParams } from "../../middlewares/requestValidate.js";
import { UploadEntityTypeSchema } from "./imageUploadValidation.js"
import {
    uploadStoreImageController, uploadImageController
} from "./imageUploadController.js";
import {
    imageUploadMiddleware,
} from "../../middlewares/imageUploadMiddleware.js";


const imageRouter = Router();
const canUpload = requireStoreRole("OWNER", "MANAGER")

imageRouter.use(authenticateUser, verifyStore, canUpload);

imageRouter.post("/store-logo", imageUploadMiddleware, uploadStoreImageController);

imageRouter.post("/:entityType", validateParams(UploadEntityTypeSchema), imageUploadMiddleware, uploadImageController)

export default imageRouter;