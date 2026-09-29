import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";

// Role gate only. Returns 403 (not 401) because the caller IS authenticated,
// they just are not allowed to perform this action.
const requireOwner = (req, res, next) => {
    if (req.user?.role !== "SHOP_OWNER") {
        return next(new AppError("Only shop owners can perform this action", constants.Forbidden));
    }
    return next();
};

export default requireOwner;
