import { z } from "zod";

const name = z.string().trim().min(1, "Brand name is required").max(100, "Brand name cannot exceed 100 characters");

const slug = z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Slug is required")
    .max(100, "Slug cannot exceed 100 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers and single hyphens");

const optionalText = (max, message) =>
    z.string().trim().max(max, message).transform((v) => v || null).nullish();

const optionalUrl = z.url("Invalid URL").max(500, "URL is too long").nullish();

export const CreateBrandSchema = z.object({
    name,
    logo: optionalUrl,
    description: optionalText(5000, "Description is too long"),
    seoTitle: optionalText(70, "SEO title cannot exceed 70 characters"),
    seoImage: optionalUrl,
    isAvailable: z.boolean().optional(),
});

// For logo and seoImage: undefined = leave as is, null = remove, string = replace
export const UpdateBrandSchema = z
    .object({
        name: name.optional(),
        slug: slug.optional(),
        logo: optionalUrl,
        description: optionalText(5000, "Description is too long"),
        seoTitle: optionalText(70, "SEO title cannot exceed 70 characters"),
        seoImage: optionalUrl,
    })
    .refine((data) => Object.values(data).some((v) => v !== undefined), {
        message: "At least one field must be provided",
    });

export const SetBrandAvailabilitySchema = z.object({
    isAvailable: z.boolean("isAvailable must be true or false"),
});

export const BrandIdSchema = z.object({
    brandId: z.uuid("Invalid brand id"),
});

export const ListBrandsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    isAvailable: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});