import { z } from "zod";

export const ORDER_STATUSES = [
    "PENDING",
    "ACCEPTED",
    "DECLINED",
    "READY",
    "DISPATCHED",
    "DELIVERED",
    "CANCELLED",
];

export const PAYMENT_METHODS = ["COD", "ESEWA", "KHALTI"];

const MAX_MONEY = 9999999999.99; // Decimal(12,2) ceiling

const money = (label) => z
    .coerce.number()
    .min(0, `${label} cannot be negative`)
    .max(MAX_MONEY, `${label} cannot exceed ${MAX_MONEY}`)
    .refine(
        (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
        `${label} can have at most 2 decimal places`
    );

// The order STATE. The actions a shop owner clicks are the transitions
// allowed out of it - see ALLOWED_TRANSITIONS in orderService.js.
export const ORDER_STATUS_TABS = ["PENDING", "ACCEPTED", "READY", "DISPATCHED", "DELIVERED", "DECLINED", "CANCELLED"];

// Checkout deliberately carries no prices. unitPrice, lineTotal, subtotal,
// discount and total are all recomputed from the products table so a client
// cannot dictate what it pays. shippingFee stays server-side at 0 because the
// schema has no per-shop shipping rate yet.
const AddressSchema = z.object({
    recipientName: z.string().trim().min(1, "Recipient name is required").max(100),
    recipientPhone: z.string().trim().length(10, "Recipient phone number must be 10 digits"),
    province: z.string().trim().max(60).optional().nullable(),
    district: z.string().trim().max(60).optional().nullable(),
    city: z.string().trim().max(60).optional().nullable(),
    address: z.string().trim().min(5, "Address is required").max(300),
    note: z.string().trim().max(300).optional().nullable(),
});

export const CheckoutSchema = z.object({
    items: z
        .array(z.object({
            productId: z.uuid("Invalid product id"),
            size: z.enum(["XS", "S", "M", "L", "XL", "XXL", "XXXL", "FREE_SIZE"], { error: "Invalid size" }),
            quantity: z.coerce.number()
                .int("Quantity must be an integer")
                .min(1, "Quantity must be at least 1")
                .max(99, "Quantity cannot exceed 99 per item"),
        }))
        .min(1, "Cart cannot be empty")
        .max(50, "Cannot order more than 50 lines at once")
        .refine(
            (list) => new Set(list.map((i) => `${i.productId}:${i.size}`)).size === list.length,
            "The same product and size appears twice"
        ),

    paymentMethod: z.enum(PAYMENT_METHODS, { error: "Invalid payment method" }),

    address: AddressSchema,
});

export const CancelOrderSchema = z.object({
    reason: z.string().trim().min(1, "Cancellation reason is required").max(200),
});

// Shop owner clicks Accept / Decline / Mark Ready / Dispatch / Mark Delivered.
export const UpdateOrderStatusSchema = z.object({
    status: z.enum(ORDER_STATUSES, { error: "Invalid order status" }),

    declineReason: z.string().trim().min(1, "Decline reason is required").max(200).optional().nullable(),

    note: z.string().trim().max(200).optional().nullable(),

    courierName: z.string().trim().max(60).optional().nullable(),

    trackingNumber: z.string().trim().max(60).optional().nullable(),
}).superRefine((data, ctx) => {
    if (data.status === "DECLINED" && !data.declineReason) {
        ctx.addIssue({
            code: "custom",
            path: ["declineReason"],
            message: "Decline reason is required when declining an order",
        });
    }
    // Dispatching without a courier reference leaves the customer unable to
    // track the parcel.
    if (data.status === "DISPATCHED" && !data.courierName && !data.trackingNumber) {
        ctx.addIssue({
            code: "custom",
            path: ["courierName"],
            message: "Courier name or tracking number is required when dispatching",
        });
    }
});

export const OrderIdParamsSchema = z.object({
    orderId: z.uuid("Invalid order id"),
});

export const ListOrdersQuerySchema = z.object({
    page: z.coerce.number()
        .int("Page must be an integer")
        .min(1, "Page must be at least 1")
        .default(1),

    limit: z.coerce.number()
        .int("Limit must be an integer")
        .min(1, "Limit must be at least 1")
        .max(50, "Limit cannot exceed 50")
        .default(10),

    status: z.enum(ORDER_STATUSES, { error: "Invalid order status" }).optional(),

    search: z.string().trim().min(1, "Search cannot be empty")
        .max(60, "Search cannot exceed 60 characters")
        .optional(),
});
