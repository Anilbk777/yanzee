import { z } from "zod";

const nullableText = (max, message) =>
  z.string().trim().max(max, message).transform((v) => v || null).nullish();

const date = z.iso.date("Date must be YYYY-MM-DD");
const hasMaxDecimals2 = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

const StockInItemSchema = z
  .object({
    productId: z.uuid("Invalid product id"),
    variantId: z.uuid("Invalid variant id").nullish(), // required for products with variants (checked in the service)
    quantity: z.number("Quantity must be a number").int("Quantity must be a whole number")
      .min(1, "Quantity must be at least 1").max(1_000_000, "Quantity is too large"),
    unitCost: z.number("Unit cost must be a number").min(0, "Unit cost cannot be negative")
      .max(999_999.99, "Unit cost is too large").refine(hasMaxDecimals2, "Unit cost can have at most 2 decimal places"),
    supplierLot: nullableText(100, "Supplier lot cannot exceed 100 characters"),
    manufactureDate: date.nullish(),
    expiryDate: date.nullish(),
  })
  .superRefine((item, ctx) => {
    if (item.manufactureDate && item.expiryDate && item.manufactureDate > item.expiryDate) {
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "Expiry date must be on or after the manufacture date" });
    }
  });

export const StockInSchema = z.object({
  outletId: z.uuid("Invalid outlet id"),
  referenceNumber: nullableText(100, "Reference number cannot exceed 100 characters"),
  supplierName: nullableText(150, "Supplier name cannot exceed 150 characters"),
  note: nullableText(500, "Note cannot exceed 500 characters"),
  items: z.array(StockInItemSchema).min(1, "Add at least one item").max(100, "At most 100 items per stock-in"),
});


const MOVEMENT_TYPES = ["STOCK_IN", "STOCK_OUT", "STOCK_RESTORE", "TRANSFER_OUT", "TRANSFER_IN", "WRITE_OFF", "ADJUSTMENT"];

// Accepts a full timestamp (2026-10-13T09:30:00+05:45, or ...Z) or a plain date (2026-10-13).
// A plain date means the whole day in Nepal time: start of day for `from`, end of day for `to`.
const instant = (edge) =>
  z
    .union([z.iso.datetime({ offset: true }), z.iso.date()], "Use a date (YYYY-MM-DD) or a full timestamp")
    .transform((v) =>
      v.length === 10
        ? new Date(`${v}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}+05:45`)
        : new Date(v)
    );

export const ListMovementsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    outletId: z.uuid("Invalid outlet id").optional(),
    type: z.enum(MOVEMENT_TYPES, "Invalid movement type").optional(),
    from: instant("start").optional(),
    to: instant("end").optional(),
  })
  .superRefine((q, ctx) => {
    if (q.from && q.to && q.from > q.to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "'to' must be after 'from'" });
    }
  });


export const ListStockQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(), // product name, variant name or SKU
  outletId: z.uuid("Invalid outlet id").optional(), // limits quantities and the breakdown to one outlet
  status: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"], "Invalid status").optional(),
});