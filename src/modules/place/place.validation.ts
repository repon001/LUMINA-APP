import { z } from "zod";
import { PlaceCategory } from "../../generated/prisma/client";
import {
  currencyCode,
  latitude,
  longitude,
  money,
  slug,
  tags,
} from "../../utils/common.validation";

export const createPlaceSchema = z.object({
  destinationId: z.string().min(1, "destinationId is required"),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(160),
  category: z.enum(PlaceCategory),
  slug: slug().optional(),
  description: z.string().trim().max(2000).optional(),
  address: z.string().trim().max(300).optional(),
  latitude,
  longitude,
  /** 1 (cheap) to 4 (splurge) — comparable across currencies, unlike `price`. */
  priceLevel: z.coerce.number().int().min(1).max(4).optional(),
  price: money("Price").optional(),
  currencyCode: currencyCode.optional(),
  imageUrl: z.url("Image must be a URL").optional(),
  website: z.url("Website must be a URL").optional(),
  phone: z.string().trim().max(40).optional(),
  tags: tags().optional(),
});

export const updatePlaceSchema = createPlaceSchema
  // A place cannot be moved to another destination: its slug is unique per
  // destination, and every itinerary item pointing at it assumes the city.
  .omit({ destinationId: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const nearbyPlacesQuerySchema = z.object({
  lat: latitude,
  lng: longitude,
  radiusKm: z.coerce.number().positive().max(200).default(5),
  limit: z.coerce.number().int().positive().max(100).default(20),
  category: z.enum(PlaceCategory).optional(),
});

export type CreatePlaceInput = z.infer<typeof createPlaceSchema>;
export type UpdatePlaceInput = z.infer<typeof updatePlaceSchema>;
export type NearbyPlacesQuery = z.infer<typeof nearbyPlacesQuerySchema>;
