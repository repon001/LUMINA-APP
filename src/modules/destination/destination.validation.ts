import { z } from "zod";
import {
  countryCode,
  currencyCode,
  latitude,
  longitude,
  slug,
  tags,
} from "../../utils/common.validation";

export const createDestinationSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  country: z.string().trim().min(2).max(80),
  countryCode,
  // Optional: the service derives one from the name when it is left out.
  slug: slug().optional(),
  description: z.string().trim().max(2000).optional(),
  latitude,
  longitude,
  timezone: z.string().trim().max(60).optional(),
  currencyCode: currencyCode.optional(),
  coverImageUrl: z.url("Cover image must be a URL").optional(),
  tags: tags().optional(),
  isFeatured: z.boolean().optional(),
});

export const updateDestinationSchema = createDestinationSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

/**
 * A proximity search. `radiusKm` is capped because the query behind it scans a
 * bounding box - a 20,000 km radius is the whole planet, not a search.
 */
export const nearbyQuerySchema = z.object({
  lat: latitude,
  lng: longitude,
  radiusKm: z.coerce.number().positive().max(2000).default(50),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;
export type UpdateDestinationInput = z.infer<typeof updateDestinationSchema>;
export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;
