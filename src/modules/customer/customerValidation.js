import z from "zod"

export const customerIdSchema = z.object({
    customerId: z.uuid({ message: "Invalid customer ID" }),
});

export const createCustomerSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(255, "Name must be at most 255 characters long"),
    phone: z.string().trim().min(1, "Phone is required").length(10, "Phone must be exactly 10 digits").regex(/^[0-9]{10}$/, "Phone must contain only digits"),
    email: z.string().trim().email("Invalid email").max(255, "Email must be at most 255 characters long").nullable(),
})

export const updateCustomerSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(255, "Name must be at most 255 characters long").optional(),
    phone: z
        .string({
            error: "Phone number is required", 
        })
        .trim()
        .min(1, "Phone number is required")
        .length(10, "Phone must be exactly 10 digits")
        .regex(/^[0-9]{10}$/, "Phone must contain only digits")
        .optional(),
    email: z.string().trim().email("Invalid email").max(255, "Email must be at most 255 characters long").nullable().optional(),
})

export const ListCustomerQuerySchema = z.object({
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().optional().default(10)
})