import { z } from "zod";
import { currencyCode } from "../../utils/common.validation";

export const planTripSchema = z.object({
  destination: z.string().trim().min(2, "Where are you going?").max(120),
  days: z.coerce.number().int().min(1).max(30),
  budget: z.coerce.number().min(0).optional(),
  currencyCode: currencyCode.optional(),
  /** "technology, food, photography" - free text, straight into the prompt. */
  interests: z.string().trim().max(400).optional(),
  travellers: z.coerce.number().int().min(1).max(20).optional(),
  pace: z.enum(["relaxed", "balanced", "packed"]).optional(),
  notes: z.string().trim().max(600).optional(),
  /** Write the result into this trip as real days and items. */
  applyToTripId: z.string().min(1).optional(),
});

export const recommendSchema = z.object({
  destination: z.string().trim().min(2).max(120),
  interests: z.string().trim().max(400).optional(),
  category: z
    .enum([
      "ATTRACTION",
      "HOTEL",
      "RESTAURANT",
      "ACTIVITY",
      "SHOPPING",
      "NIGHTLIFE",
      "TRANSPORT",
      "OTHER",
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const packingListRequestSchema = z.object({
  destination: z.string().trim().min(2).max(120),
  days: z.coerce.number().int().min(1).max(60),
  season: z.string().trim().max(60).optional(),
  activities: z.string().trim().max(400).optional(),
  travellers: z.coerce.number().int().min(1).max(20).optional(),
});

export const assistantSchema = z.object({
  message: z.string().trim().min(1, "Ask something").max(2000),
  /** The client owns the conversation; the server stays stateless. */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
  tripId: z.string().min(1).optional(),
});

export type PlanTripInput = z.infer<typeof planTripSchema>;
export type RecommendInput = z.infer<typeof recommendSchema>;
export type PackingListInput = z.infer<typeof packingListRequestSchema>;
export type AssistantInput = z.infer<typeof assistantSchema>;
