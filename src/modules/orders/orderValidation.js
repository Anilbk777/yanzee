import { z } from "zod";
import { instant } from "../../utils/dateRange.js";


const MAX_MONEY = 9_999_999_999.99;
const hasMaxDecimals2 = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

const nullableText = (max, message) =>
    z.string().trim().max(max, message).transform((v) => v || null).nullish();

const money = (message) =>
    z.number(message).min(0, "Amount cannot be negative").max(MAX_MONEY, "Amount is too large")
        .refine(hasMaxDecimals2, "Amount can have at most 2 decimal places");

const DiscountSchema = z
    .object({
        type: z.enum(["FIXED", "PERCENT"], "Invalid discount type"),
        value: z.number("Discount must be a number").positive("Discount must be greater than 0")
            .max(MAX_MONEY, "Discount is too large")
            .refine(hasMaxDecimals2, "Discount can have at most 2 decimal places"),
    })
    .superRefine((d, ctx) => {
        if (d.type === "PERCENT" && d.value > 100) {
            ctx.addIssue({ code: "custom", path: ["value"], message: "A percent discount cannot exceed 100" });
        }
    });

const OrderItemSchema = z.object({
    productId: z.uuid("Invalid product id"),
    variantId: z.uuid("Invalid variant id").nullish(), // required for products with variants (checked in the service)
    quantity: z.number("Quantity must be a number").int("Quantity must be a whole number")
        .min(1, "Quantity must be at least 1").max(100_000, "Quantity is too large"),
    discount: DiscountSchema.nullish(),
});

export const CreateOrderSchema = z
    .object({
        channel: z.enum(["POS", "ADMIN"], "Channel must be POS or ADMIN"),
        outletId: z.uuid("Invalid outlet id").optional(), // POS: the counter. ADMIN: optional preferred outlet (default: main)
        customerId: z.uuid("Invalid customer id"),

        province: nullableText(100, "Province is too long"),
        district: nullableText(100, "District is too long"),
        city: nullableText(100, "City is too long"),
        address: nullableText(200, "Address cannot exceed 200 characters"),
        landmark: nullableText(150, "Landmark is too long"),
        orderNote: nullableText(500, "Order note cannot exceed 500 characters"),

        deliveryFee: money("Delivery fee must be a number").optional(),
        discount: DiscountSchema.nullish(), // whole-order discount

        paymentMethod: z.enum(["COD", "CASH", "BANK_TRANSFER", "CARD", "FONEPAY", "ESEWA", "KHALTI"], "Invalid payment method"),
        paymentStatus: z.enum(["UNPAID", "PARTIAL_PAID", "PAID"], "Invalid payment status").optional(),
        paidAmount: money("Paid amount must be a number").optional(), // PARTIAL_PAID only
        paymentReference: nullableText(100, "Payment reference is too long"),

        items: z.array(OrderItemSchema).min(1, "Add at least one item").max(100, "At most 100 items per order"),
    })
    .superRefine((o, ctx) => {
        const issue = (path, message) => ctx.addIssue({ code: "custom", path, message });

        if (o.channel === "POS" && !o.outletId) issue(["outletId"], "Choose the outlet for this POS order");
        if (o.channel === "ADMIN" && !o.address) issue(["address"], "Address is required");

        const status = o.paymentStatus ?? "UNPAID";
        if (status === "PARTIAL_PAID" && !(o.paidAmount > 0)) issue(["paidAmount"], "Enter the amount paid so far");
        if (status !== "PARTIAL_PAID" && o.paidAmount !== undefined) issue(["paidAmount"], "Paid amount is only used for partial payments");

        const seen = new Set();
        o.items.forEach((item, i) => {
            const key = `${item.productId}:${item.variantId ?? ""}`;
            if (seen.has(key)) issue(["items", i], "This item is already in the order. Change its quantity instead");
            seen.add(key);
        });
    });



export const ListOrdersQuerySchema = z
    .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().trim().max(100).optional(), // customer name, phone or order number
        status: z.enum(["PENDING", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED", "RETURNED"], "Invalid status").optional(),
        channel: z.enum(["ALL", "POS", "WEB"], "Channel must be ALL, POS or WEB").default("ALL"),
        from: instant("start").optional(),
        to: instant("end").optional(),
    })
    .superRefine((q, ctx) => {
        if (q.from && q.to && q.from > q.to) {
            ctx.addIssue({ code: "custom", path: ["to"], message: "'to' must be after 'from'" });
        }
    });

export const OrderIdSchema = z.object({
    orderId: z.uuid("Invalid order id"),
});

const emailField = z
    .union([z.literal(""), z.string().trim().toLowerCase().max(255, "Email is too long").pipe(z.email("Invalid email format"))])
    .transform((v) => v || null)
    .nullish();

export const UpdateOrderSummarySchema = z
    .object({
        items: z.array(OrderItemSchema)
            .min(1, "An order needs at least one item. Cancel the order instead")
            .max(100, "At most 100 items per order").optional(),
        deliveryFee: money("Delivery fee must be a number").optional(),
        discount: DiscountSchema.nullish(), // object = set, null = remove, omitted = unchanged
        paymentStatus: z.enum(["UNPAID", "PARTIAL_PAID", "PAID"], "Invalid payment status").optional(),
        paidAmount: money("Paid amount must be a number").optional(),
        paymentReference: nullableText(100, "Payment reference is too long"),
    })
    .superRefine((o, ctx) => {
        const issue = (path, message) => ctx.addIssue({ code: "custom", path, message });

        // if (o.items === undefined && o.deliveryFee === undefined && o.discount === undefined && o.paymentStatus === undefined) {
        //     issue([], "Nothing to update");
        // }
        if (o.paymentStatus === "PARTIAL_PAID" && !(o.paidAmount > 0)) issue(["paidAmount"], "Enter the amount paid so far");
        if (o.paymentStatus !== "PARTIAL_PAID" && o.paidAmount !== undefined) issue(["paidAmount"], "Paid amount is only used for partial payments");

        const seen = new Set();
        o.items?.forEach((item, i) => {
            const key = `${item.productId}:${item.variantId ?? ""}`;
            if (seen.has(key)) issue(["items", i], "This item is already in the order. Change its quantity instead");
            seen.add(key);
        });
    });

export const UpdateOrderCustomerSchema = z
    .object({
        name: z.string().trim().min(1, "Name is required").max(100, "Name is too long").optional(),
        email: emailField,
        phone: z
            .string({
                error: "Phone number is required",
            })
            .trim()
            .min(1, "Phone number is required")
            .length(10, "Phone must be exactly 10 digits")
            .regex(/^[0-9]{10}$/, "Phone must contain only digits")
            .optional(),
        province: nullableText(100, "Province is too long"),
        district: nullableText(100, "District is too long"),
        city: nullableText(100, "City is too long"),
        address: z.string().trim().min(1, "Address is required").max(200, "Address cannot exceed 200 characters").optional(),
        landmark: nullableText(150, "Landmark is too long"),
        customerNote: nullableText(500, "Customer note cannot exceed 500 characters"),
    })
    .refine((o) => Object.values(o).some((v) => v !== undefined), { message: "At least one field must be provided" });


export const UpdateOrderStatusSchema = z
    .object({
        status: z.enum(["PENDING", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED", "RETURNED"], "Invalid status"),
        reason: nullableText(300, "Reason cannot exceed 300 characters"),
        restoreStock: z.boolean("restoreStock must be true or false").optional(), // RETURNED only (default true)
        markAsPaid: z.boolean("markAsPaid must be true or false").optional(), // DELIVERED only
    })
    .superRefine((o, ctx) => {
        const issue = (path, message) => ctx.addIssue({ code: "custom", path, message });

        if ((o.status === "CANCELLED" || o.status === "RETURNED") && !o.reason) {
            issue(["reason"], "Enter the reason");
        }
        if (o.restoreStock !== undefined && o.status !== "RETURNED") issue(["restoreStock"], "Only used when marking an order as returned");
        if (o.markAsPaid !== undefined && o.status !== "DELIVERED") issue(["markAsPaid"], "Only used when marking an order as delivered");
    });