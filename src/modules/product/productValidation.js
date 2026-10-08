import { z } from "zod";

// ---------- limits (match the Prisma column types) ----------
const MAX_MONEY = 9_999_999_999.99; // Decimal(12, 2)
const MAX_WEIGHT = 99_999.999;      // Decimal(8, 3)
const MAX_QUANTITY = 10_000_000;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

// ---------- helpers ----------
const hasMaxDecimals = (places) => (v) =>
    Math.abs(v * 10 ** places - Math.round(v * 10 ** places)) < 1e-6;

const money = ({ min = 0 } = {}) =>
    z.number("Price must be a number")
        .min(min, `Price must be at least ${min}`)
        .max(MAX_MONEY, "Price is too large")
        .refine(hasMaxDecimals(2), "Price can have at most 2 decimal places");

// "" becomes null, null/undefined allowed (null = clear the field on update)
const nullableText = (max, message) =>
    z.string().trim().max(max, message).transform((v) => v || null).nullish();

const uniqueArray = (item, { min = 0, max, label }) =>
    z.array(item)
        .min(min, `At least ${min} ${label} required`)
        .max(max, `You can add at most ${max} ${label}`)
        .refine((arr) => new Set(arr).size === arr.length, `Duplicate ${label} are not allowed`);

const issue = (ctx, path, message) => ctx.addIssue({ code: "custom", path, message });

// ---------- reusable field rules (NO .default() anywhere, so update schemas can't reset values) ----------
const imageUrl = z.url("Invalid URL").nullish();


const sku = z
    .string().trim().toUpperCase().max(64, "SKU cannot exceed 64 characters")
    .regex(/^[A-Z0-9][A-Z0-9._-]*$/, "SKU can only contain letters, numbers, dot, dash and underscore")
    .nullish();

const sellingPrice = money({ min: 0.01 });

// Price, stock and identifier fields shared by the product and by every variant
const inventoryShape = {
    crossedPrice: money({ min: 0.01 }).nullish(),
    costPrice: money().nullish(),
    quantity: z.number("Quantity must be a number").int("Quantity must be a whole number")
        .min(0, "Quantity cannot be negative").max(MAX_QUANTITY, "Quantity is too large").optional(),
    weight: z.number("Weight must be a number").positive("Weight must be greater than 0")
        .max(MAX_WEIGHT, "Weight is too large")
        .refine(hasMaxDecimals(3), "Weight (kg) can have at most 3 decimal places").nullish(),
    sku,
    hsCode: z.string().trim().regex(/^\d{4,10}$/, "HS code must be 4 to 10 digits").nullish(),
    altBarcode: z.string().trim().regex(/^[A-Za-z0-9-]{4,50}$/, "Invalid barcode").nullish(),
};

// ---------- cross-field checks (kept out of the object schemas so .partial()/.extend() keep working) ----------
const checkCrossedPrice = (data, ctx) => {
    if (data.crossedPrice != null && data.sellingPrice != null && data.crossedPrice < data.sellingPrice) {
        issue(ctx, ["crossedPrice"], "Crossed price must be greater than or equal to the selling price");
    }
};

const rejectDuplicates = (ctx, variants, field, normalize = (v) => v) => {
    const seen = new Set();
    variants.forEach((variant, i) => {
        if (variant[field] == null) return;
        const key = normalize(variant[field]);
        if (seen.has(key)) issue(ctx, ["variants", i, field], `Duplicate variant ${field}`);
        seen.add(key);
    });
};

// ---------- variant ----------
export const variantShape = {
    name: z.string().trim().min(1, "Variant name is required").max(100, "Variant name cannot exceed 100 characters"),
    size: nullableText(30, "Size cannot exceed 30 characters"),
    colorCodes: uniqueArray(
        z.string().trim().toLowerCase().regex(HEX_COLOR, "Color must be a hex code like #fff or #1a2b3c"),
        { max: 2, label: "color codes" }
    ).optional(),
    sellingPrice, // required on a variant
    ...inventoryShape,
};

export const VariantSchema = z.object(variantShape).superRefine(checkCrossedPrice);

// An existing variant carries its id, and a new one has none
export const VariantInputSchema = z
    .object({ id: z.uuid("Invalid variant id").optional(), ...variantShape })
    .superRefine(checkCrossedPrice);

// ---------- update ----------
const slug = z
    .string().trim().toLowerCase().min(1, "Slug is required").max(150, "Slug cannot exceed 150 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers and single hyphens");

const generalShape = {
    name: z.string().trim().min(1, "Product name is required").max(150, "Product name cannot exceed 150 characters"),
    channel: z.enum(["ALL", "WEBSITE", "POS"], "Invalid channel").optional(),
    audience: z.enum(["MEN", "WOMEN", "UNISEX", "BOY", "GIRL", "KIDS_UNISEX"], "Invalid audience").optional(),
    brandId: z.uuid("Invalid brand id").nullish(),
    categoryIds: uniqueArray(z.uuid("Invalid category id"), { max: 10, label: "categories" }),
    productDescription: nullableText(500, "Description cannot exceed 500 characters"),
    longDescription: nullableText(10000, "Long description cannot exceed 10000 characters"),
    imageUrls: uniqueArray(imageUrl, { max: 10, label: "images" }),
};

const baseShape = { sellingPrice: sellingPrice.optional(), ...inventoryShape };

const availabilityShape = { isAvailable: z.boolean("isAvailable must be true or false").optional() };

const customShape = {
    tags: z.array(z.string().trim().toLowerCase().min(1, "Tag cannot be empty").max(30, "Tag cannot exceed 30 characters"))
        .max(20, "You can add at most 20 tags")
        .transform((tags) => [...new Set(tags)])
        .optional(),
    releaseDate: z
        .union([z.iso.datetime({ offset: true }), z.iso.date()], "Invalid release date")
        .transform((v) => new Date(v))
        .nullish(),
    similarProductIds: uniqueArray(z.uuid("Invalid product id"), { max: 20, label: "similar products" }).optional(),
};

const seoShape = {
    seoTitle: nullableText(70, "SEO title cannot exceed 70 characters"),
    seoDescription: nullableText(300, "SEO description cannot exceed 300 characters"),
    seoImage: imageUrl.nullish(), // null removes it
};

const statusEnum = z.enum(["ACTIVE", "DRAFT", "ARCHIVED"], "Invalid status");

// ---------- cross-field rules ----------
export const BASE_ONLY_FIELDS = ["crossedPrice", "sellingPrice", "costPrice", "quantity", "weight", "sku", "hsCode", "altBarcode"];

const atLeastOne = (data, ctx) => {
    if (Object.values(data).every((v) => v === undefined)) issue(ctx, [], "At least one field must be provided");
};

const rejectBaseFields = (data, ctx) => {
    for (const field of BASE_ONLY_FIELDS) {
        if (data[field] != null) issue(ctx, [field], `${field} must be set on each variant when the product has variants`);
    }
};

const checkVariantList = (variants, ctx) => {
    rejectDuplicates(ctx, variants, "name", (v) => v.toLowerCase());
    rejectDuplicates(ctx, variants, "sku");
    rejectDuplicates(ctx, variants, "id");
};



// ---------- create ----------
export const CreateProductSchema = z
    .object({
        ...generalShape,
        ...baseShape,
        ...availabilityShape,
        ...customShape,
        status: statusEnum.optional(),
        variants: z.array(VariantSchema).max(100, "A product can have at most 100 variants").optional(),
    })
    .superRefine((data, ctx) => {
        const variants = data.variants ?? [];

        if (variants.length === 0) {
            if (data.sellingPrice == null) issue(ctx, ["sellingPrice"], "Selling price is required for a product without variants");
            checkCrossedPrice(data, ctx);
            return;
        }
        rejectBaseFields(data, ctx);
        checkVariantList(variants, ctx);
    });


// ---------- the 5 update schemas ----------
export const UpdateGeneralSchema = z.object({ ...generalShape, slug }).partial().superRefine(atLeastOne);

export const UpdateInventorySchema = z
    .object({
        ...baseShape,
        ...availabilityShape,
        variants: z.array(VariantInputSchema).max(100, "A product can have at most 100 variants").optional(),
    })
    .superRefine((data, ctx) => {
        atLeastOne(data, ctx);
        if (data.variants?.length > 0) {
            rejectBaseFields(data, ctx);
            checkVariantList(data.variants, ctx);
        } else {
            checkCrossedPrice(data, ctx); // only when both prices are in the request
        }
    });

export const UpdateCustomSchema = z.object(customShape).partial().superRefine(atLeastOne);

export const UpdateStatusSchema = z.object({ status: statusEnum });

export const UpdateSeoSchema = z.object(seoShape).partial().superRefine(atLeastOne);

export const ProductIdSchema = z.object({ productId: z.uuid("Invalid product id") });


export const ListProductsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional(),
    channel: z.enum(["ALL", "WEBSITE", "POS"]).optional(),
    audience: z.enum(["MEN", "WOMEN", "UNISEX", "BOY", "GIRL", "KIDS_UNISEX"]).optional(),
    brandId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    isAvailable: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});