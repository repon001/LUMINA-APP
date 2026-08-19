import { z } from "zod";
import { ItineraryItemKind, TransportMode } from "../../generated/prisma/client";
import { currencyCode, dateOnly, money } from "../../utils/common.validation";

/**
 * A wall-clock time at the destination, "09:30".
 *
 * Not a timestamp: an itinerary says "09:30 local", and an instant would drift
 * the moment the trip crossed a timezone.
 */
const timeOfDay = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must look like 09:30`);

export const addDaySchema = z.object({
  /** Where in the trip. Appended after the last day when omitted. */
  dayNumber: z.coerce.number().int().min(1).optional(),
  date: dateOnly("date").optional(),
  title: z.string().trim().max(140).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updateDaySchema = z
  .object({
    date: dateOnly("date").nullable().optional(),
    title: z.string().trim().max(140).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const reorderDaysSchema = z.object({
  dayIds: z.array(z.string().min(1)).min(1, "Send the day ids in their new order"),
});

const itemFields = {
  kind: z.enum(ItineraryItemKind).optional(),
  title: z.string().trim().min(1, "Title is required").max(200),
  placeId: z.string().min(1).optional(),
  startTime: timeOfDay("startTime").optional(),
  endTime: timeOfDay("endTime").optional(),
  cost: money("Cost").optional(),
  currencyCode: currencyCode.optional(),
  transportMode: z.enum(TransportMode).optional(),
  notes: z.string().trim().max(1000).optional(),
};

/** An item that ends before it starts is a typo, not a plan. */
const withOrderedTimes = <T extends z.ZodType>(schema: T) =>
  schema.refine(
    (value: unknown) => {
      const { startTime, endTime } = value as { startTime?: string; endTime?: string };
      return !startTime || !endTime || endTime >= startTime;
    },
    { message: "endTime cannot be before startTime", path: ["endTime"] },
  );

export const addItemSchema = withOrderedTimes(
  z.object({
    ...itemFields,
    position: z.coerce.number().int().min(0).optional(),
  }),
);

export const updateItemSchema = withOrderedTimes(
  z
    .object({
      kind: itemFields.kind,
      title: z.string().trim().min(1).max(200).optional(),
      placeId: z.string().min(1).nullable().optional(),
      startTime: timeOfDay("startTime").nullable().optional(),
      endTime: timeOfDay("endTime").nullable().optional(),
      cost: money("Cost").nullable().optional(),
      currencyCode: currencyCode.nullable().optional(),
      transportMode: z.enum(TransportMode).nullable().optional(),
      notes: z.string().trim().max(1000).nullable().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "Provide at least one field to update",
    }),
);

export const reorderItemsSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1, "Send the item ids in their new order"),
});

/** Drag a card onto another day, which is the app's main editing gesture. */
export const moveItemSchema = z.object({
  toDayId: z.string().min(1, "toDayId is required"),
  position: z.coerce.number().int().min(0).optional(),
});

export type AddDayInput = z.infer<typeof addDaySchema>;
export type UpdateDayInput = z.infer<typeof updateDaySchema>;
export type ReorderDaysInput = z.infer<typeof reorderDaysSchema>;
export type AddItemInput = z.infer<typeof addItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
export type MoveItemInput = z.infer<typeof moveItemSchema>;
