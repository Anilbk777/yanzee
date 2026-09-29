import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";
import jwt from "jsonwebtoken";
import { getUserById } from "../modules/auth/authModel.js";

const authenticateUser = async (req, res, next) => {
    try {
        const token = req.cookies?.accessToken || req.headers.authorization?.replace("Bearer ", "");
        if (!token) {
            return next(new AppError("Unauthorized access", constants.Unauthorized));
        }
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_TOKEN_SECRET);
        const user = await getUserById(decoded.id);
        if (!user) {
            return next(new AppError("Unauthorized access", constants.Unauthorized));
        }
        req.userId = user.id;
        req.user = user;
        next();
    } catch (error) {
        return next(new AppError("Unauthorized access", constants.Unauthorized));
    }
}

export default authenticateUser;