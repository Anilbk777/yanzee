import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";

const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            throw new AppError("Unauthorized", constants.Unauthorized);
        }
        next();
    };
}

export default authorizeRole;