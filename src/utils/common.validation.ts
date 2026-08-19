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

/** A URL-safe identifier: lowercase words joined by single hyphens. */
export const slug = (label = "Slug") =>
  z
    .string()
    .trim()
    .toLowerCase()
    .min(2, `${label} must be at least 2 characters`)
    .max(80)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      `${label} may contain lowercase letters, numbers and hyphens`,
    );

export const latitude = z.coerce
  .number({ error: "Latitude must be a number" })
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90");

export const longitude = z.coerce
  .number({ error: "Longitude must be a number" })
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180");

/** ISO 3166-1 alpha-2, stored uppercase so lookups never depend on casing. */
export const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Country code must be two letters, e.g. JP");

/** ISO 4217, e.g. JPY. */
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency code must be three letters, e.g. JPY");

/**
 * Free-form labels. Normalised to lowercase and de-duplicated, so "Food" and
 * "food" cannot both end up on the same record and split a filter in two.
 */
export const tags = (max = 20) =>
  z
    .array(z.string().trim().toLowerCase().min(1).max(30))
    .max(max, `At most ${max} tags`)
    .transform((values) => [...new Set(values)]);
