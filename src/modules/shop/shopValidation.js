import { z } from "zod";

const imageUrl = z
    .url("Image must be a valid URL")
    .trim()
    .max(2048, "Image URL cannot exceed 2048 characters");

export const CreateShopSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Shop name is required")
        .max(50, "Shop name cannot exceed 50 characters"),

    contactEmail: z
        .email("Invalid email format")
        .trim()
        .toLowerCase()
        .max(255, "Email is too long"),

    image: imageUrl.optional().nullable(),

    description: z
        .string()
        .trim()
        .max(300, "Description cannot exceed 300 characters")
        .optional()
        .nullable(),

    returnPolicy: z
        .string()
        .trim()
        .max(200, "Return policy cannot exceed 200 characters")
        .optional()
        .nullable(),
});

export const UpdateShopSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, "Shop name is required")
            .max(50, "Shop name cannot exceed 50 characters")
            .optional(),

        contactEmail: z
            .email("Invalid email format")
            .trim()
            .toLowerCase()
            .max(255, "Email is too long")
            .optional(),

        image: imageUrl.optional().nullable(),

        description: z
            .string()
            .trim()
            .max(300, "Description cannot exceed 300 characters")
            .optional()
            .nullable(),

        returnPolicy: z
            .string()
            .trim()
            .max(200, "Return policy cannot exceed 200 characters")
            .optional()
            .nullable(),
    });

export const ShopIdParamsSchema = z.object({
    shopId: z.uuid("Invalid shop id"),
});

export const ListShopsQuerySchema = z.object({
    page: z.coerce.number()
        .int("Page must be an integer")
        .min(1, "Page must be at least 1")
        .default(1),

    limit: z.coerce.number()
        .int("Limit must be an integer")
        .min(1, "Limit must be at least 1")
        .max(50, "Limit cannot exceed 50")
        .default(10),

    search: z
        .string()
        .trim()
        .min(1, "Search cannot be empty")
        .max(100, "Search cannot exceed 100 characters")
        .optional(),
});
