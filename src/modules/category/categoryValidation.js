import { z } from "zod";

const name = z.string().trim().min(1, "Category name is required").max(100, "Category name cannot exceed 100 characters");

const slug = z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Slug is required")
    .max(100, "Slug cannot exceed 100 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers and single hyphens");

const image = z.url("Invalid image URL");

// "" becomes null; null/undefined are allowed, so clients can clear a field
const optionalText = (max, message) =>
    z.string().trim().max(max, message).transform((v) => v || null).nullish();

const optionalUrl = z.url("Invalid URL").nullish();

export const CreateCategorySchema = z.object({
    name,
    image, // required
    description: optionalText(5000, "Description is too long"),
    seoTitle: optionalText(70, "SEO title cannot exceed 70 characters"),
    seoImage: optionalUrl,
    isAvailable: z.boolean().optional(), // DB default is true
});

export const UpdateCategorySchema = z
    .object({
        name: name.optional(),
        slug: slug.optional(),
        image: image.optional(), // can be replaced but not cleared
        description: optionalText(5000, "Description is too long"),
        seoTitle: optionalText(70, "SEO title cannot exceed 70 characters"),
        seoImage: optionalUrl
    });

export const SetAvailabilitySchema = z.object({
    isAvailable: z.boolean("isAvailable must be true or false"),
});

export const CategoryIdSchema = z.object({
    categoryId: z.uuid("Invalid category id"),
});

export const ListCategoriesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    // z.coerce.boolean() would turn the string "false" into true, so map it by hand
    isAvailable: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});