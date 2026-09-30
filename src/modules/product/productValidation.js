import { z } from "zod";

export const PRODUCT_CATEGORIES = [
    "FASHION",
    "SPORTS",
    "KIDS",
    "BEAUTY",
    "OUTLET",
    "PREMIUM",
    "HOME_DECOR",
];

export const PRODUCT_STATUSES = ["ACTIVE", "DRAFT", "OUT_OF_STOCK"];

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "FREE_SIZE"];

const MAX_MONEY = 9999999999.99; // Decimal(12,2) ceiling

const money = (label) => z
    .coerce.number()
    .positive(`${label} must be greater than 0`)
    .max(MAX_MONEY, `${label} cannot exceed ${MAX_MONEY}`)
    .refine(
        (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
        `${label} can have at most 2 decimal places`
    );

const imageUrl = z
    .url("Image must be a valid URL")
    .max(2048, "Image URL cannot exceed 2048 characters");

const gallery = z
    .array(imageUrl)
    .max(10, "Gallery cannot have more than 10 images")
    .default([]);

const variant = z.object({
    size: z.enum(SIZES, { error: "Invalid size" }),
    stock: z.coerce.number()
        .int("Stock must be an integer")
        .min(0, "Stock cannot be negative")
        .max(1_000_000, "Stock cannot exceed 1000000"),
    sku: z.string().trim().min(1, "SKU cannot be empty").max(64, "SKU cannot exceed 64 characters")
        .optional()
        .nullable(),
});

const variants = z
    .array(variant)
    .min(1, "At least one variant is required")
    .max(20, "A product cannot have more than 20 variants")
    .refine(
        (list) => new Set(list.map((item) => item.size)).size === list.length,
        "Two variants cannot have the same size"
    );

const commonFields = {
    name: z.string().trim().min(1, "Product name is required").max(120, "Product name cannot exceed 120 characters"),

    category: z.enum(PRODUCT_CATEGORIES, { error: "Invalid product category" }),

    status: z.enum(PRODUCT_STATUSES, { error: "Invalid product status" }).default("DRAFT"),

    price: money("Price"),

    discountPrice: money("Discount price").optional().nullable(),

    image: imageUrl.optional().nullable(),

    description: z.string().trim().max(5000, "Description cannot exceed 5000 characters")
        .optional()
        .nullable(),
};

// Status WITHOUT the DRAFT default. `z.enum().default("DRAFT").optional()` still
// applies the default in Zod 4, which would silently reset status back to
// DRAFT on every partial update.
const updateFields = {
    ...commonFields,
    status: z.enum(PRODUCT_STATUSES, { error: "Invalid product status" }).optional(),
};

export const CreateProductSchema = z.object({
    ...commonFields,
    gallery,
    variants,
}).superRefine((data, ctx) => {
    if (data.discountPrice != null && data.discountPrice > data.price) {
        ctx.addIssue({
            code: "custom",
            path: ["discountPrice"],
            message: "Discount price cannot be greater than price",
        });
    }
});

export const UpdateProductSchema = z
    .object({
        name: updateFields.name.optional(),
        category: updateFields.category.optional(),
        status: updateFields.status,
        price: updateFields.price.optional(),
        discountPrice: updateFields.discountPrice,
        image: updateFields.image,
        description: updateFields.description,
        gallery: z.array(imageUrl).max(10, "Gallery cannot have more than 10 images").optional(),
        variants: variants.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field is required to update",
    });

export const ProductIdParamsSchema = z.object({
    productId: z.uuid("Invalid product id"),
});

export const ListProductsQuerySchema = z.object({
    page: z.coerce.number()
        .int("Page must be an integer")
        .min(1, "Page must be at least 1")
        .default(1),

    limit: z.coerce.number()
        .int("Limit must be an integer")
        .min(1, "Limit must be at least 1")
        .max(50, "Limit cannot exceed 50")
        .default(10),

    search: z.string().trim().min(1, "Search cannot be empty").max(100, "Search cannot exceed 100 characters")
        .optional(),

    category: z.enum(PRODUCT_CATEGORIES, { error: "Invalid product category" }).optional(),

    status: z.enum(PRODUCT_STATUSES, { error: "Invalid product status" }).optional(),

    sort: z.enum(["newest", "oldest", "price_asc", "price_desc", "name_asc"], {
        error: "Invalid sort option",
    }).optional(),

    shopId: z.string().uuid("Invalid shop id").optional(),
});
