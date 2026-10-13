import logger from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import constants from "../../utils/constants.js";
import {
    createOutletModel, getOutletsModel, getOutletByIdModel, updateOutletModel,
    setOutletStatusModel, deleteOutletModel, getOutletFlagsModel, countOutletDependenciesModel,
} from "./outletModel.js";

const isUniqueViolation = (error) => error?.code === "P2002";
const isNotFound = (error) => error?.code === "P2025";
const isForeignKeyViolation = (error) => error?.code === "P2003";

const NAME_TAKEN = "An outlet with this name already exists in your store";

const DEPENDENCY_LABELS = {
    receipts: "stock receipts",
    batches: "stock batches",
    movements: "stock movements",
    transfersOut: "outgoing transfers",
    transfersIn: "incoming transfers",
    orders: "orders",
};

// { receipts: 2, orders: 5 } -> "2 stock receipts and 5 orders"
const formatDependencies = (counts) => {
    const parts = Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([key, n]) => `${n} ${DEPENDENCY_LABELS[key] ?? key}`);

    if (parts.length <= 1) return parts.join("");
    return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
};

// P2025 on a guarded write: either the outlet doesn't exist, or it is the main outlet
const explainBlockedWrite = async (storeId, outletId, action) => {
    const outlet = await getOutletFlagsModel(storeId, outletId);
    if (!outlet) return new AppError("Outlet not found", constants.NotFound);
    return new AppError(`The main outlet can't be ${action}`, constants.Conflict);
};

export const createOutletService = async (storeId, payload) => {
    logger.info({ storeId }, "Creating outlet");

    try {
        const outlet = await createOutletModel(storeId, payload);
        return { statusCode: 201, message: "Outlet created successfully", data: { outlet } };
    } catch (error) {
        if (isUniqueViolation(error)) throw new AppError(NAME_TAKEN, constants.Conflict);
        throw error;
    }
};

export const getOutletsService = async (storeId, query) => {
    const { items, total } = await getOutletsModel(storeId, query);

    return {
        statusCode: 200,
        message: "Outlets fetched successfully",
        data: {
            outlets: items,
            pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
        },
    };
};

export const getOutletService = async (storeId, outletId) => {
    const outlet = await getOutletByIdModel(storeId, outletId);
    if (!outlet) throw new AppError("Outlet not found", constants.NotFound);

    return { statusCode: 200, message: "Outlet fetched successfully", data: { outlet } };
};

export const updateOutletService = async (storeId, outletId, payload) => {
    logger.info({ storeId, outletId }, "Updating outlet");

    try {
        const outlet = await updateOutletModel(storeId, outletId, payload);
        return { statusCode: 200, message: "Outlet updated successfully", data: { outlet } };
    } catch (error) {
        if (isUniqueViolation(error)) throw new AppError(NAME_TAKEN, constants.Conflict);
        if (isNotFound(error)) throw new AppError("Outlet not found", constants.NotFound);
        throw error;
    }
};

export const setOutletStatusService = async (storeId, outletId) => {
    const outlet = await getOutletByIdModel(storeId, outletId);
    if (!outlet) throw new AppError("Outlet not found", constants.NotFound);

    const updatedOutlet = await setOutletStatusModel(storeId, outletId, { isActive: !outlet.isActive });
    return {
        statusCode: 200,
        message: `Outlet turned ${updatedOutlet.isActive ? "on" : "off"} successfully`,
        data: { outlet: updatedOutlet },
    };

};

export const deleteOutletService = async (storeId, outletId) => {
    logger.info({ storeId, outletId }, "Deleting outlet");

    try {
        const deletedOutlet = await deleteOutletModel(storeId, outletId);
        return { statusCode: 200, message: "Outlet deleted successfully", data: { deletedOutlet } };
    } catch (error) {
        if (isNotFound(error)) throw await explainBlockedWrite(storeId, outletId, "deleted");

        if (isForeignKeyViolation(error)) {
            const result = await countOutletDependenciesModel(storeId, outletId);
            const details = result ? formatDependencies(result._count) : "";

            logger.warn({ storeId, outletId, details }, "Outlet delete blocked by related records");

            throw new AppError(
                details
                    ? `This outlet can't be deleted because it still has ${details} attached to it. Turn the outlet off instead.`
                    : "This outlet can't be deleted because other records are still attached to it. Turn the outlet off instead.",
                constants.Conflict
            );
        }
        throw error;
    }
};