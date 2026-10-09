import z from "zod"
import { IMAGE_KINDS } from "../../utils/imageUtils/imageUrl.js";

export const IMAGE_ENTITY_TYPES = IMAGE_KINDS;

export const UploadEntityTypeSchema = z.object({ entityType: z.enum(IMAGE_ENTITY_TYPES) });
