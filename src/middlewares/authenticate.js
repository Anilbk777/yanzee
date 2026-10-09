import jwt from "jsonwebtoken";
import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";

const authenticateUser = (req, res, next) => {
    try {
        const token = req.cookies?.accessToken || req.headers.authorization?.replace("Bearer ", "");
        if (!token) throw new AppError("Unauthorized access", constants.Unauthorized);

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_ACCESS_TOKEN_SECRET);
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                throw new AppError("Access token expired", constants.Unauthorized);
            }
            throw new AppError("Invalid token", constants.Unauthorized); // tampered, malformed, wrong secret
        }

        if (!decoded.isActive) throw new AppError("Unauthorized access", constants.Unauthorized);

        req.userId = decoded.id;
        req.user = decoded;
        next();
    } catch (error) {
        next(error);
    }
};

export default authenticateUser;