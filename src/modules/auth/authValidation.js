import { z } from "zod";
import { isValidCloudinaryImageUrl } from "../../utils/imageUpload.js";

const genderEnum = z.enum(["MALE", "FEMALE", "OTHER"]);
const roleEnum = z.enum(["CUSTOMER", "SHOP_OWNER"]);

export const RegisterUserSchema = z.object({
    fullName: z
        .string()
        .trim()
        .min(2, "Name must be at least 2 characters")
        .max(50, "Name cannot exceed 50 characters"),

    email: z
        .string()
        .trim()
        .email("Invalid email address")
        .max(255, "Email is too long")
        .toLowerCase(),

    password: z
        .string()
        .trim()
        .min(8, "Password must be at least 8 characters")
        .max(100, "Password cannot exceed 100 characters")
        .regex(/[A-Za-z]/, "Password must contain at least one letter")
        .regex(/\d/, "Password must contain at least one number")
        .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character")
        .regex(/^\S*$/, "Password must not contain spaces"),

    phone:z.string().trim().length(10),
    gender:genderEnum.default("MALE"),
    role:roleEnum.default("CUSTOMER"),
    address:z.string().trim().min(1,"address can't be empty").optional(),
    city:z.string().trim().min(1,"city can't be empty").optional(),
    province:z.string().trim().min(1,"province can't be empty").optional(),
    district:z.string().trim().min(1,"district can't be empty").optional(),
    country:z.string().trim().min(1,"country can't be empty").optional(),
});

export const LoginUserSchema = z.object({
    email: z
        .string()
        .trim()
        .email("Invalid email address")
        .max(255, "Email is too long")
        .toLowerCase(),

    password: z
        .string()
        .trim()
});

const shortText = (label, max) => z
    .string()
    .trim()
    .max(max, `${label} cannot exceed ${max} characters`);

// Anchored to our own Cloudinary cloud so the asset can always be cleaned up
// when it is later replaced or removed. `.nullable()` is how a client says
// "delete my profile picture" by sending null.
const profileImage = z
    .string()
    .trim()
    .max(2048, "Image URL cannot exceed 2048 characters")
    .refine(isValidCloudinaryImageUrl, { message: "Invalid image URL" });

// .strict() so a body carrying `email`, `role` or `password` fails loudly
// instead of being silently dropped. Changing the password goes through its own
// endpoint, which can verify the current password first.
//
// fullName, phone and gender are .optional() but NOT .nullable(): they are
// NOT NULL in the database, so omitting them keeps the stored value while
// sending null is rejected with a clear message rather than blowing up on a
// database constraint later.
export const UpdateUserSchema = z
    .object({
        fullName: z
            .string()
            .trim()
            .min(2, "Name must be at least 2 characters")
            .max(50, "Name cannot exceed 50 characters")
            .optional(),

        phone: z.string().trim().length(10, "Phone must be exactly 10 characters").optional(),

        gender: genderEnum.optional(),

        country: shortText("Country", 100).optional().nullable(),
        province: shortText("Province", 100).optional().nullable(),
        district: shortText("District", 100).optional().nullable(),
        city: shortText("City", 100).optional().nullable(),
        address: shortText("Address", 200).optional().nullable(),

        profileImg: profileImage.optional().nullable(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field is required to update",
    });
