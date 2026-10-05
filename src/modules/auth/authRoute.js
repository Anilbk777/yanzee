import { Router } from "express";
import { validateRequest } from "../../middlewares/requestValidate.js"
import { RegisterUserSchema, LoginUserSchema } from "./authValidation.js"
import authenticateUser from "../../middlewares/authenticate.js";
import {
    registerUserController,
    loginController,
    refreshTokenController,
    logoutController,
    meController,
} from "./authController.js"

const authRouter = Router();

authRouter.post("/register", validateRequest(RegisterUserSchema), registerUserController);
authRouter.post("/login", validateRequest(LoginUserSchema), loginController);
authRouter.post("/refresh", authenticateUser, refreshTokenController);
authRouter.post("/logout", authenticateUser, logoutController);
authRouter.get("/me", authenticateUser, meController);


export default authRouter;