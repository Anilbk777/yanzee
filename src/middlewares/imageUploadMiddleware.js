import multer from "multer";
import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";

const { maxFileSizeBytes, maxImagesPerUpload, allowedMimeTypes } = constants.IMAGE_LIMITS;

const SINGLE_FIELD = "image";
const MULTIPLE_FIELD = "images";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new AppError(`Invalid file type, only ${allowedMimeTypes.join(", ")} are allowed`, constants.BadRequest), false);
    }
    cb(null, true);
};

const uploadSingle = multer({
    storage,
    limits: {
        fileSize: maxFileSizeBytes,
    },
    fileFilter,
});

const uploadMultiple = multer({
    storage,
    limits: {
        fileSize: maxFileSizeBytes,
        files: maxImagesPerUpload,
    },
    fileFilter,
});

const mb = (bytes) => `${Math.round(bytes / (1024 * 1024))}MB`;

// Multer rejects with a plain MulterError, which is not an operational AppError,
// so globalErrorHandler used to turn "too many images" into a 500 "An internal
// error occurred". These messages tell the client exactly what to fix.
const toAppError = (error, expectedField) => {
    switch (error.code) {
        case "LIMIT_FILE_COUNT":
            return new AppError(`You can upload at most ${maxImagesPerUpload} images at a time`, constants.BadRequest);

        case "LIMIT_UNEXPECTED_FILE":
            // multer reports the offending field name. Only the "too many files in
            // the right field" case gets the count message; a wrong field name is
            // a different mistake and gets a different fix.
            return error.field === expectedField
                ? new AppError(`You can upload at most ${maxImagesPerUpload} images at a time`, constants.BadRequest)
                : new AppError(`Unexpected file field "${error.field}". Upload images using the "${expectedField}" field`, constants.BadRequest);

        case "LIMIT_FILE_SIZE":
            return new AppError(`Each image must be ${mb(maxFileSizeBytes)} or smaller`, constants.BadRequest);

        case "LIMIT_PART_COUNT":
        case "LIMIT_FIELD_COUNT":
        case "LIMIT_FIELD_KEY":
        case "LIMIT_FIELD_VALUE":
        case "INVALID_FIELD_NAME":
        case "MISSING_FIELD_NAME":
            return new AppError("Invalid file upload request", constants.BadRequest);

        default:
            return new AppError("Image upload failed. Please try again.", constants.BadRequest);
    }
};

const handleUploadErrors = (middleware, expectedField) => (req, res, next) => {
    middleware(req, res, (error) => {
        if (!error) return next();
        next(error instanceof multer.MulterError ? toAppError(error, expectedField) : error);
    });
};

export const imageUploadMiddleware = handleUploadErrors(uploadSingle.single(SINGLE_FIELD), SINGLE_FIELD);
export const imageMultipleUploadMiddleware = handleUploadErrors(
    uploadMultiple.array(MULTIPLE_FIELD, maxImagesPerUpload),
    MULTIPLE_FIELD
);