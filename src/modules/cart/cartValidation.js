import { z } from "zod";

export const AddToCartSchema = z.object({
    variantId: z.string().uuid("Invalid variant id"),
    quantity: z.coerce
        .number()
        .int("Quantity must be an integer")
        .min(1, "Quantity must be at least 1")
        .max(99, "Quantity cannot exceed 99 per item")
        .default(1),
});

export const UpdateCartItemSchema = z
    .object({
        quantity: z.coerce
            .number()
            .int("Quantity must be an integer")
            .min(1, "Quantity must be at least 1")
            .max(99, "Quantity cannot exceed 99 per item")
            .optional(),
        isSelected: z.boolean().optional(),
    })
    .refine(
        (data) => data.quantity !== undefined || data.isSelected !== undefined,
        "At least one of quantity or isSelected must be provided"
    );

export const CartItemIdParamsSchema = z.object({
    itemId: z.string().uuid("Invalid item id"),
});

export const SelectAllSchema = z.object({
    isSelected: z.boolean({ required_error: "isSelected is required" }),
});

export const SelectShopSchema = z.object({
    shopId: z.string().uuid("Invalid shop id"),
    isSelected: z.boolean({ required_error: "isSelected is required" }),
});
