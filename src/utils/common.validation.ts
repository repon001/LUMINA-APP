import { z } from "zod";

export const idParamSchema = z.object({
  id: z.string().min(1, "id is required"),
});

/**
 * Money arrives as a JSON number or a string and is normalised to a fixed
 * 2-decimal string. Prisma stores that exactly in a `Decimal` column, so no
 * value ever passes through a binary float.
 */
export const money = (label = "Amount") =>
  z
    .union([z.number(), z.string()])
    .refine((value) => String(value).trim() !== "" && Number.isFinite(Number(value)), {
      message: `${label} must be a number`,
    })
    .transform((value) => Number(value))
    .refine((value) => value >= 0, { message: `${label} cannot be negative` })
    .transform((value) => value.toFixed(2));

/** A positive whole quantity, e.g. units ordered. */
export const quantity = (label = "Quantity") =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .positive(`${label} must be greater than zero`);
