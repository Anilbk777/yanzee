import { z } from "zod";

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
