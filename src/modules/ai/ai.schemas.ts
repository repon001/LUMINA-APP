import { z } from "zod";

/**
 * The shapes the model must answer in.
 *
 * Each one is sent to the provider as JSON Schema *and* used to validate the
 * reply, so the contract cannot drift between the prompt and the parser.
 *
 * They are deliberately close to what the itinerary module already stores, so
 * an accepted plan can be written straight into a trip.
 */

export const generatedItemSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(["PLACE", "TRANSPORT", "MEAL", "ACCOMMODATION", "ACTIVITY", "NOTE"]),
  /** Wall-clock at the destination, like every other time in the system. */
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  /** Free text: the model suggests real places, the app matches them later. */
  placeName: z.string().max(160),
  notes: z.string().max(400),
  estimatedCost: z.number().min(0),
});

export const generatedDaySchema = z.object({
  dayNumber: z.number().int().min(1),
  title: z.string().min(1).max(140),
  summary: z.string().max(400),
  items: z.array(generatedItemSchema).min(1).max(10),
});

export const generatedPlanSchema = z.object({
  tripTitle: z.string().min(1).max(140),
  overview: z.string().max(800),
  currencyCode: z.string().length(3),
  estimatedTotal: z.number().min(0),
  days: z.array(generatedDaySchema).min(1).max(30),
  tips: z.array(z.string().max(300)).max(8),
});

export const recommendationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        name: z.string().max(160),
        category: z.enum([
          "ATTRACTION",
          "HOTEL",
          "RESTAURANT",
          "ACTIVITY",
          "SHOPPING",
          "NIGHTLIFE",
          "TRANSPORT",
          "OTHER",
        ]),
        why: z.string().max(300),
        bestTime: z.string().max(80),
        estimatedCost: z.number().min(0),
      }),
    )
    .min(1)
    .max(20),
});

export const packingListSchema = z.object({
  summary: z.string().max(400),
  groups: z
    .array(
      z.object({
        group: z.string().max(60),
        items: z
          .array(
            z.object({
              item: z.string().max(120),
              quantity: z.number().int().min(1).max(50),
              essential: z.boolean(),
              why: z.string().max(200),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .min(1)
    .max(10),
});

export const assistantReplySchema = z.object({
  reply: z.string().min(1).max(4000),
  /** Follow-ups the app renders as tappable chips. */
  suggestions: z.array(z.string().max(120)).max(4),
});

export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
export type Recommendations = z.infer<typeof recommendationSchema>;
export type PackingList = z.infer<typeof packingListSchema>;
export type AssistantReply = z.infer<typeof assistantReplySchema>;
