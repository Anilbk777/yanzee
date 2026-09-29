
import logger from "../utils/logger.js";
import constants from "../utils/constants.js";

// Helper to format errors in Development (Verbose for debugging)
const sendErrorDev = (err, res) => {
    const statusCode = err.statusCode || constants.InternalServerError;
    const message = err.message || "Internal Server Error";
    const stack = err.stack || "";
    res.status(statusCode).json({
        statusCode: statusCode,
        success: false,
        message: message,
        stack: stack
    });
};

// Helper to format errors in Production (Secure and clean)
const sendErrorProd = (err, res) => {
    const statusCode = err.statusCode || constants.InternalServerError;
    const message = err.message || "Internal Server Error";
    // A) Trusted Operational Error: Send clear message to client
    if (err.isOperational) {
        return res.status(statusCode).json({
            statusCode: statusCode,
            success: false,
            message: message
        });
    }

    // B) Programming/Unknown Error: Do not leak technical implementation details
    // 1. Log full technical details internally so developers see it
    logger.error('💥 CRITICAL UNKNOWN ERROR:', err);

    // 2. Send generic friendly message to client
    res.status(constants.InternalServerError).json({
        statusCode: constants.InternalServerError,
        success: false,
        message: 'An internal error occurred. Please try again later.'
    });
};

const globalErrorHandler = (err, req, res, next) => {
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
        sendErrorDev(err, res);
    } else {
        sendErrorProd(err, res);
    }
}

export default globalErrorHandler;