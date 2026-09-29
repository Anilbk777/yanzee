export class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.success = false;
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor)
    }
}

export default AppError