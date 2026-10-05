import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";

const requireStoreRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
        return next(new AppError("You don't have permission to perform this action", constants.Forbidden));
    }
    next();
};

export default requireStoreRole;