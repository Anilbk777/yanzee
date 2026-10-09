import { fileTypeFromBuffer } from "file-type";
import AppError from "../AppError.js";
import constants from "../constants.js";

export const validateRealFileType = async (buffer) => {
    const type = await fileTypeFromBuffer(buffer);

    if (!type?.mime.startsWith("image/")) {
        throw new AppError("Invalid file type", constants.BadRequest);
    }
    return type.mime;
};