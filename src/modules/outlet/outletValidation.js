import { z } from "zod";

const nullableText = (max, message) =>
    z.string().trim().max(max, message).transform((v) => v || null).nullish();

const fields = {
    name: z.string().trim().min(1, "Outlet name is required").max(100, "Outlet name cannot exceed 100 characters"),
    address: z.string().trim().min(1, "Address is required").max(200, "Address cannot exceed 200 characters"),
    contactPerson: nullableText(100, "Contact person cannot exceed 100 characters"),
    contactPhone: z.string().trim().regex(/^\d{10}$/, "Phone number must be exactly 10 digits").nullish(),
};

// isMain is not accepted anywhere: Zod strips unknown keys, so a client can't set it
export const CreateOutletSchema = z.object(fields);

export const UpdateOutletSchema = z
    .object(fields)
    .partial();

export const SetOutletStatusSchema = z.object({
    isActive: z.boolean("isActive must be true or false"),
});

export const OutletIdSchema = z.object({
    outletId: z.uuid("Invalid outlet id"),
});

export const ListOutletsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});