import { z } from "zod";

const categories = ["GENERAL", "FASHION", "BEAUTY", "ELECTRONICS", "GROCERY", "PHARMACY", "PET_SUPPLIES", "SPORTS", "RESTAURANTS", "HOME_DECOR", "OTHER"];

const fields = {
    name: z.string().trim().min(1, "Store name is required").max(50, "Store name cannot exceed 50 characters"),
    category: z.enum(categories, "Invalid category"),
    contactEmail: z
        .string()
        .trim()
        .toLowerCase()
        .max(255, "Email is too long")
        .pipe(z.email("Invalid email format")),
    contactPhone: z.string().trim().regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
    storeAddress: z.string().trim().min(1, "Address is required").max(200, "Address cannot exceed 200 characters"),
};

export const CreateStoreSchema = z.object({
    ...fields
});
export const UpdateStoreSchema = z
    .object({
        name: fields.name.optional(),
        category: fields.category.optional(),
        contactEmail: fields.contactEmail.optional(),
        contactPhone: fields.contactPhone.optional(),
        storeAddress: fields.storeAddress.optional(),
    });

export const StoreIdSchema = z.object({
    storeId: z.string().uuid()
})
