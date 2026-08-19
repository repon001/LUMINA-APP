import { z } from "zod";
import { TransportMode, TripStatus, TripVisibility } from "../../generated/prisma/client";
import { currencyCode, dateOnly, money, tags } from "../../utils/common.validation";

/** A trip cannot end before it starts, and both dates travel together. */
const withOrderedDates = <T extends z.ZodType>(schema: T) =>
  schema.refine(
    (value: unknown) => {
      const { startDate, endDate } = value as { startDate?: Date; endDate?: Date };
      return !startDate || !endDate || endDate >= startDate;
    },
    { message: "endDate cannot be before startDate", path: ["endDate"] },
  );

export const createTripSchema = withOrderedDates(
  z.object({
    title: z.string().trim().min(2, "Title must be at least 2 characters").max(140),
    summary: z.string().trim().max(2000).optional(),
    coverImageUrl: z.url("Cover image must be a URL").optional(),
    startDate: dateOnly("startDate").optional(),
    endDate: dateOnly("endDate").optional(),
    status: z.enum(TripStatus).optional(),
    visibility: z.enum(TripVisibility).optional(),
    budgetTotal: money("Budget").optional(),
    currencyCode: currencyCode.optional(),
    tags: tags().optional(),
  }),
);

export const updateTripSchema = withOrderedDates(
  z
    .object({
      title: z.string().trim().min(2).max(140).optional(),
      summary: z.string().trim().max(2000).nullable().optional(),
      coverImageUrl: z.url().nullable().optional(),
      startDate: dateOnly("startDate").nullable().optional(),
      endDate: dateOnly("endDate").nullable().optional(),
      status: z.enum(TripStatus).optional(),
      budgetTotal: money("Budget").nullable().optional(),
      currencyCode: currencyCode.nullable().optional(),
      tags: tags().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "Provide at least one field to update",
    }),
);

/**
 * Visibility is changed through its own endpoint rather than through PATCH:
 * turning a trip public also has to mint or drop a share code, which is a
 * different kind of action from renaming it.
 */
export const shareTripSchema = z.object({
  visibility: z.enum([TripVisibility.UNLISTED, TripVisibility.PUBLIC]),
  /** Mint a new code, invalidating any link already handed out. */
  regenerate: z.boolean().optional(),
});

export const addStopSchema = z.object({
  destinationId: z.string().min(1, "destinationId is required"),
  /** Where in the route. Appended to the end when omitted. */
  position: z.coerce.number().int().min(0).optional(),
  arrivalDate: dateOnly("arrivalDate").optional(),
  departureDate: dateOnly("departureDate").optional(),
  transportToNext: z.enum(TransportMode).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateStopSchema = z
  .object({
    arrivalDate: dateOnly("arrivalDate").nullable().optional(),
    departureDate: dateOnly("departureDate").nullable().optional(),
    transportToNext: z.enum(TransportMode).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

/** The full route in its new order, so the server never has to guess. */
export const reorderStopsSchema = z.object({
  stopIds: z.array(z.string().min(1)).min(1, "Send the stop ids in their new order"),
});

export const duplicateTripSchema = z.object({
  title: z.string().trim().min(2).max(140).optional(),
});

export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type ShareTripInput = z.infer<typeof shareTripSchema>;
export type AddStopInput = z.infer<typeof addStopSchema>;
export type UpdateStopInput = z.infer<typeof updateStopSchema>;
export type ReorderStopsInput = z.infer<typeof reorderStopsSchema>;
export type DuplicateTripInput = z.infer<typeof duplicateTripSchema>;
