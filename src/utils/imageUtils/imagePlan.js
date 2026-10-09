import AppError from "../AppError.js";
import constants from "../constants.js";
import { parseImageUrl, publicIdOf, toFinalId, urlFromPublicId } from "./imageUrl.js";

// Create, or a new image on update. The URL must be a fresh temp upload for this store and kind.
// Returns the final URL for the DB and the move for the worker.
export const planNewImage = (rawUrl, storeId, kind) => {
    const parsed = parseImageUrl(rawUrl, storeId, kind);
    if (!parsed?.isTemp) throw new AppError("Image must be freshly uploaded", constants.BadRequest);

    const toId = toFinalId(parsed.publicId);
    return { url: urlFromPublicId(toId), move: { fromId: parsed.publicId, toId } };
};

// One image field on update. value: undefined = unchanged, null = remove, string = replace.
// url is undefined when the DB column must not be touched.
export const planImageField = (value, current, storeId, kind) => {
    if (value === undefined || value === current) return { url: undefined, move: null, removedId: null };

    const removedId = publicIdOf(current, storeId, kind);
    if (value === null) return { url: null, move: null, removedId };

    const { url, move } = planNewImage(value, storeId, kind);
    return { url, move, removedId };
};