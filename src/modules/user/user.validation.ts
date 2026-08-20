import { z } from "zod";
import { Role } from "../../generated/prisma/client";

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(Role),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.email().optional(),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
    role: z.enum(Role).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * What a user may change about themselves.
 *
 * Deliberately not `updateUserSchema`: that one accepts `role` and `isActive`,
 * and a self-service endpoint that took those would let anyone promote
 * themselves to admin with a single request.
 */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(120).optional(),
    email: z.email("A valid email is required").optional(),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
    currentPassword: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  })
  .refine((value) => !value.password || Boolean(value.currentPassword), {
    message: "Your current password is required to set a new one",
    path: ["currentPassword"],
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
