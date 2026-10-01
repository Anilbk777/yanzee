import { Router } from "express";
import { validateRequest } from "../../middlewares/requestValidate.js"
import { RegisterUserSchema, LoginUserSchema, UpdateUserSchema } from "./authValidation.js"
import authenticateUser from "../../middlewares/authenticate.js";
import {
    registerUserController,
    loginController,
    refreshTokenController,
    logoutController,
    meController,
    updateMeController
} from "./authController.js"

const authRouter = Router();

authRouter.post("/register", validateRequest(RegisterUserSchema), registerUserController);
authRouter.post("/login", validateRequest(LoginUserSchema), loginController);
authRouter.post("/refresh", authenticateUser, refreshTokenController);
authRouter.post("/logout", authenticateUser, logoutController);
authRouter.get("/me", authenticateUser, meController);
authRouter.patch("/me", authenticateUser, validateRequest(UpdateUserSchema), updateMeController);


export default authRouter;