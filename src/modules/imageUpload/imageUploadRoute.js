import { Router } from "express";
import {
    uploadUserImageController,
    uploadShopImageController,
    uploadProductImageController
} from "./imageUploadController.js";
import {
    imageUploadMiddleware,
} from "../../middlewares/imageUploadMiddleware.js";
import authenticateUser from "../../middlewares/authenticate.js";
import requireOwner from "../../middlewares/requireOwner.js";
import { UserRole } from "../../../generated/prisma/index.js";
import authorizeRole from "../../middlewares/authorizeRole.js";

const imageRouter = Router();

imageRouter.post(
    "/user",
    authenticateUser,
    authorizeRole([UserRole.CUSTOMER, UserRole.SHOP_OWNER]),
    imageUploadMiddleware,
    uploadUserImageController
);
imageRouter.post(
    "/shop",
    authenticateUser,
    authorizeRole([UserRole.SHOP_OWNER]),
    imageUploadMiddleware,
    uploadShopImageController
);
imageRouter.post(
    "/product/cover",
    authenticateUser,
    requireOwner,
    imageUploadMiddleware,
    uploadProductImageController
)

export default imageRouter;