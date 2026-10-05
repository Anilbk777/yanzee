import z from "zod"
import { IMAGE_ENTITY_TYPES } from "../../utils/imageUpload.js"

export const UploadEntityTypeSchema = z.object({ entityType: z.enum(IMAGE_ENTITY_TYPES) });
