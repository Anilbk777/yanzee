import { z } from "zod";

/* =====================================================================
   LIMITS (match the Prisma column types)
===================================================================== */
const MAX_MONEY = 9_999_999_999.99; // Decimal(12, 2)
const MAX_WEIGHT = 99_999.999;      // Decimal(8, 3)
const MAX_QUANTITY = 10_000_000;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

/* =====================================================================
   SMALL HELPERS
===================================================================== */
const issue = (ctx, path, message) => ctx.addIssue({ code: "custom", path, message });

const hasMaxDecimals = (places) => (value) =>
    Math.abs(value * 10 ** places - Math.round(value * 10 ** places)) < 1e-6;

// "" becomes null. null/undefined allowed (null = clear the field on update)
const nullableText = (max, message) =>
    z.string().trim().max(max, message).transform((v) => v || null).nullish();

const uniqueArray = (item, { max, label }) =>
    z.array(item)
        .max(max, `You can add at most ${max} ${label}`)
        .refine((arr) => new Set(arr).size === arr.length, `Duplicate ${label} are not allowed`);

const money = (min) =>
    z.number("Price must be a number")
        .min(min, `Price must be at least ${min}`)
        .max(MAX_MONEY, "Price is too large")
        .refine(hasMaxDecimals(2), "Price can have at most 2 decimal places");

/* =====================================================================
   ENUMS
===================================================================== */
const channelEnum = z.enum(["ALL", "WEBSITE", "POS"], "Invalid channel");
const audienceEnum = z.enum(["MEN", "WOMEN", "UNISEX", "BOY", "GIRL", "KIDS_UNISEX"], "Invalid audience");
const statusEnum = z.enum(["ACTIVE", "DRAFT", "ARCHIVED"], "Invalid status");

/* =====================================================================
   FIELDS: general
   (no .default() anywhere, so update schemas can never reset a value)
===================================================================== */
const name = z.string().trim().min(1, "Product name is required").max(150, "Product name cannot exceed 150 characters");

const slug = z
    .string().trim().toLowerCase()
    .min(1, "Slug is required")
    .max(150, "Slug cannot exceed 150 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers and single hyphens");

const channel = channelEnum.optional();
const audience = audienceEnum.optional();
const brandId = z.uuid("Invalid brand id").nullish();
const categoryIds = uniqueArray(z.uuid("Invalid category id"), { max: 10, label: "categories" });
const productDescription = nullableText(500, "Description cannot exceed 500 characters");
const longDescription = nullableText(10000, "Long description cannot exceed 10000 characters");
const imageUrls = uniqueArray(z.url("Invalid URL"), { max: 10, label: "images" });
const isAvailable = z.boolean("isAvailable must be true or false").optional();
const status = statusEnum;

const outletId = z.uuid("Invalid outlet id").optional();

/* =====================================================================
   FIELDS: price, stock and identifiers (used by product AND variants)
===================================================================== */
const sellingPrice = money(0.01);              // required
const optionalSellingPrice = sellingPrice.optional();
const crossedPrice = money(0.01).nullish();
const costPrice = money(0).nullish();

const quantity = z
    .number("Quantity must be a number")
    .int("Quantity must be a whole number")
    .min(0, "Quantity cannot be negative")
    .max(MAX_QUANTITY, "Quantity is too large")
    .optional();

const weight = z
    .number("Weight must be a number")
    .positive("Weight must be greater than 0")
    .max(MAX_WEIGHT, "Weight is too large")
    .refine(hasMaxDecimals(3), "Weight (kg) can have at most 3 decimal places")
    .nullish();

const sku = z
    .string().trim().toUpperCase()
    .max(64, "SKU cannot exceed 64 characters")
    .regex(/^[A-Z0-9][A-Z0-9._-]*$/, "SKU can only contain letters, numbers, dot, dash and underscore")
    .nullish();

const hsCode = z.string().trim().regex(/^\d{4,10}$/, "HS code must be 4 to 10 digits").nullish();
const altBarcode = z.string().trim().regex(/^[A-Za-z0-9-]{4,50}$/, "Invalid barcode").nullish();

/* =====================================================================
   FIELDS: variant only
===================================================================== */
const variantId = z.uuid("Invalid variant id").optional();

const variantName = z.string().trim().min(1, "Variant name is required").max(100, "Variant name cannot exceed 100 characters");

const size = nullableText(30, "Size cannot exceed 30 characters");

const colorCodes = uniqueArray(
    z.string().trim().toLowerCase().regex(HEX_COLOR, "Color must be a hex code like #fff or #1a2b3c"),
    { max: 2, label: "color codes" }
).optional();

const variantImageUrls = uniqueArray(z.url("Invalid URL"), { max: 5, label: "images" }).optional();
/* =====================================================================
   FIELDS: custom (tags, release date, similar products)
===================================================================== */
const tags = z
    .array(z.string().trim().toLowerCase().min(1, "Tag cannot be empty").max(30, "Tag cannot exceed 30 characters"))
    .max(20, "You can add at most 20 tags")
    .transform((list) => [...new Set(list)])
    .optional();

const releaseDate = z
    .union([z.iso.datetime({ offset: true }), z.iso.date()], "Invalid release date")
    .transform((v) => new Date(v))
    .nullish();

const similarProductIds = uniqueArray(z.uuid("Invalid product id"), { max: 20, label: "similar products" }).optional();

/* =====================================================================
   FIELDS: SEO
===================================================================== */
const seoTitle = nullableText(70, "SEO title cannot exceed 70 characters");
const seoDescription = nullableText(300, "SEO description cannot exceed 300 characters");
const seoImage = z.url("Invalid URL").nullish(); // null removes it

/* =====================================================================
   CROSS-FIELD RULES
===================================================================== */

// Fields that live on each variant when the product has variants
export const BASE_ONLY_FIELDS = [
    "crossedPrice", "sellingPrice", "costPrice", "quantity",
    "weight", "sku", "hsCode", "altBarcode",
];

const checkCrossedPrice = (data, ctx) => {
    if (data.crossedPrice != null && data.sellingPrice != null && data.crossedPrice < data.sellingPrice) {
        issue(ctx, ["crossedPrice"], "Crossed price must be greater than or equal to the selling price");
    }
};

const atLeastOne = (data, ctx) => {
    if (Object.values(data).every((v) => v === undefined)) {
        issue(ctx, [], "At least one field must be provided");
    }
};

// Product has variants, so price/stock fields must not be set on the product itself
const rejectBaseFields = (data, ctx) => {
    for (const field of BASE_ONLY_FIELDS) {
        if (data[field] != null) issue(ctx, [field], `${field} must be set on each variant when the product has variants`);
    }
};

const rejectDuplicateVariants = (variants, field, ctx, normalize = (v) => v) => {
    const seen = new Set();
    variants.forEach((variant, i) => {
        if (variant[field] == null) return;
        const key = normalize(variant[field]);
        if (seen.has(key)) issue(ctx, ["variants", i, field], `Duplicate variant ${field}`);
        seen.add(key);
    });
};

const checkVariantList = (variants, ctx) => {
    rejectDuplicateVariants(variants, "name", ctx, (v) => v.toLowerCase());
    rejectDuplicateVariants(variants, "sku", ctx);
    rejectDuplicateVariants(variants, "id", ctx);
};

/* =====================================================================
   VARIANT SCHEMAS
===================================================================== */

// New variant (used on create): no id
export const VariantSchema = z
    .object({
        name: variantName,
        size,
        colorCodes,
        imageUrls: variantImageUrls,   // new
        isAvailable,
        sellingPrice, // required on a variant
        crossedPrice,
        costPrice,
        quantity,
        weight,
        sku,
        hsCode,
        altBarcode,
    })
    .superRefine(checkCrossedPrice);

// Variant on update: existing ones carry their id, new ones have none
export const VariantInputSchema = z
    .object({
        id: variantId,
        name: variantName,
        size,
        colorCodes,
        imageUrls: variantImageUrls,   // new
        isAvailable,
        sellingPrice, // required on a variant
        crossedPrice,
        costPrice,
        quantity,
        weight,
        sku,
        hsCode,
        altBarcode,
    })
    .strict()
    .superRefine(checkCrossedPrice);

/* =====================================================================
   CREATE
===================================================================== */
export const CreateProductSchema = z
    .object({
        // general
        outletId,
        name,
        channel,
        audience,
        brandId,
        categoryIds,
        productDescription,
        longDescription,
        imageUrls,
        isAvailable,
        status: status.optional(),

        // price & stock (only when the product has no variants)
        sellingPrice: optionalSellingPrice,
        crossedPrice,
        costPrice,
        quantity,
        weight,
        sku,
        hsCode,
        altBarcode,

        // custom
        tags,
        releaseDate,
        similarProductIds,

        // variants
        variants: z.array(VariantSchema).max(100, "A product can have at most 100 variants").optional(),
    })
    .superRefine((data, ctx) => {
        const variants = data.variants ?? [];

        if (variants.length === 0) {
            if (data.sellingPrice == null) {
                issue(ctx, ["sellingPrice"], "Selling price is required for a product without variants");
            }
            checkCrossedPrice(data, ctx);
            return;
        }

        rejectBaseFields(data, ctx);
        checkVariantList(variants, ctx);
    });

/* =====================================================================
   UPDATE (5 schemas, one per section)
===================================================================== */
export const UpdateGeneralSchema = z
    .object({
        name,
        slug,
        channel,
        audience,
        brandId,
        categoryIds,
        productDescription,
        longDescription,
        imageUrls,
        isAvailable,
    })
    .partial()
    .superRefine(atLeastOne);

export const UpdateInventorySchema = z
    .object({
        sellingPrice: optionalSellingPrice,
        crossedPrice,
        costPrice,
        weight,
        sku,
        hsCode,
        altBarcode,
        isAvailable,
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

export const UpdateCustomSchema = z
    .object({ tags, releaseDate, similarProductIds })
    .partial()
    .superRefine(atLeastOne);

export const UpdateStatusSchema = z.object({ status });

export const UpdateSeoSchema = z
    .object({ seoTitle, seoDescription, seoImage })
    .partial()
    .superRefine(atLeastOne);

/* =====================================================================
   PARAMS & QUERIES
===================================================================== */
export const ProductIdSchema = z.object({ productId: z.uuid("Invalid product id") });

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const search = z.string().trim().max(100).optional();
const booleanString = z.enum(["true", "false"]).transform((v) => v === "true");

export const ListProductsQuerySchema = z.object({
    page,
    limit,
    search,
    status: statusEnum.optional(),
    channel: channelEnum.optional(),
    audience: audienceEnum.optional(),
    brandId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    isAvailable: booleanString.optional(),
});

export const ListSellableItemsQuerySchema = z.object({
    page,
    limit,
    search, // SKU, product name or variant name
    outletId: z.uuid("Invalid outlet id").optional(),     // default: all active outlets
    categoryId: z.uuid("Invalid category id").optional(), // one category only
    channel: z.enum(["POS", "ADMIN"], "Channel must be POS or ADMIN").optional(),
    includeOutOfStock: booleanString.default(false),
});