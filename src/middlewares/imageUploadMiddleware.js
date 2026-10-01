import multer from "multer";
import AppError from "../utils/AppError.js";
import constants from "../utils/constants.js";

const storage = multer.memoryStorage();
const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const fileFilter = (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(new AppError(`Invalid file type, only ${ALLOWED_MIME_TYPES.join(", ")} are allowed`, constants.BadRequest), false);
    } else {
        cb(null, true);
    }
};

const uploadSingle = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
});

const uploadMultiple = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 5,
    },
    fileFilter,
});

export const imageUploadMiddleware = uploadSingle.single("image");
export const imageMultipleUploadMiddleware = uploadMultiple.array("images", 5);