import { prisma } from "../../config/prisma";
import type { AuthenticatedUser } from "../../utils/request";
import { findEditableTrip } from "../trip/trip.access";
import { complete, type CompletionUsage } from "./ai.provider";
import {
  assistantReplySchema,
  generatedPlanSchema,
  packingListSchema,
  recommendationSchema,
  type GeneratedPlan,
} from "./ai.schemas";
import type {
  AssistantInput,
  PackingListInput,
  PlanTripInput,
  RecommendInput,
} from "./ai.validation";

/**
 * One voice for every feature, so answers read consistently in the app.
 *
 * The rules that matter are the last two: a plan the traveller cannot act on is
 * worse than no plan, and a confidently invented opening time is worse still.
 */
const SYSTEM = `You are LUMINA's travel planner. You know cities the way a local guide does.

Rules:
- Name real, specific places. Never invent a venue.
- Respect the stated budget, pace and interests. If the budget is tight, say so in the overview rather than silently planning something unaffordable.
- Keep each day physically possible: group places that are near each other, and leave travel time between them.
- Times are local wall-clock, 24-hour, "09:30".
- Costs are per person in the requested currency, as a number with no symbol.
- If you are unsure of a detail such as opening hours, keep the suggestion but stay general rather than stating a specific fact you cannot back.`;

const money = (value: number) => value.toFixed(2);

export interface AiResult<T> {
  data: T;
  usage: CompletionUsage;
  model: string;
}

const planPrompt = (input: PlanTripInput) =>
  [
    `Plan a ${input.days}-day trip to ${input.destination}.`,
    input.travellers ? `Travellers: ${input.travellers}.` : "",
    input.budget
      ? `Total budget: ${input.budget} ${input.currencyCode ?? "USD"} per person.`
      : "No fixed budget.",
    input.interests ? `Interests: ${input.interests}.` : "",
    input.pace ? `Pace: ${input.pace}.` : "",
    input.notes ? `Also consider: ${input.notes}` : "",
    "Give each day 3 to 6 items, in the order they happen.",
  ]
    .filter(Boolean)
    .join("\n");

export const planTrip = async (
  user: AuthenticatedUser,
  input: PlanTripInput,
): Promise<AiResult<GeneratedPlan> & { appliedTo?: string }> => {
  // Check the trip before spending a paid request on a plan we cannot store.
  if (input.applyToTripId) await findEditableTrip(input.applyToTripId, user);

  const result = await complete({
    system: SYSTEM,
    prompt: planPrompt(input),
    schema: generatedPlanSchema,
    schemaName: "trip_plan",
    // A 30-day plan is a lot of JSON, and reasoning models spend part of this
    // budget thinking before they emit any of it.
    maxTokens: 16000,
  });

  if (!input.applyToTripId) return result;

  await applyPlanToTrip(input.applyToTripId, result.data);
  return { ...result, appliedTo: input.applyToTripId };
};

/**
 * Writes a generated plan into a trip as real days and items.
 *
 * Replaces the itinerary rather than merging: the traveller asked for a plan for
 * this trip, and interleaving a generated day 3 with an existing day 3 produces
 * something nobody asked for. One statement, so a failure leaves the previous
 * itinerary intact.
 *
 * Items keep the suggested place name as their title and are not linked to
 * catalogue places - matching free text to a Place is a separate problem, and a
 * wrong match is worse than no link.
 */
export const applyPlanToTrip = async (tripId: string, plan: GeneratedPlan) => {
  const days = plan.days.map((day, dayIndex) => ({
    dayNumber: dayIndex + 1,
    title: day.title,
    notes: day.summary,
    items: {
      create: day.items.map((item, position) => ({
        position,
        kind: item.kind,
        title: item.placeName || item.title,
        startTime: item.startTime,
        endTime: item.endTime,
        notes: item.notes,
        cost: item.estimatedCost > 0 ? money(item.estimatedCost) : null,
        currencyCode: plan.currencyCode,
      })),
    },
  }));

  // A batched transaction, not an interactive one. The generation before this
  // takes a minute or more, and an interactive transaction opened afterwards
  // has to wait on a pooled connection that may have gone stale - which is
  // exactly how this failed the first time. The array form is one round trip
  // and holds no connection open while the model is thinking.
  await prisma.$transaction([
    prisma.tripDay.deleteMany({ where: { tripId } }),
    prisma.trip.update({
      where: { id: tripId },
      data: {
        // The generated total is the planner's estimate, so it fills in the
        // currency and budget rather than overriding a considered one.
        ...(plan.estimatedTotal > 0 ? { budgetTotal: money(plan.estimatedTotal) } : {}),
        currencyCode: plan.currencyCode,
        days: { create: days },
      },
    }),
  ]);
};

export const recommend = async (input: RecommendInput) =>
  complete({
    system: SYSTEM,
    prompt: [
      `Recommend ${input.limit} places in ${input.destination}.`,
      input.category ? `Only of category ${input.category}.` : "",
      input.interests ? `The traveller likes: ${input.interests}.` : "",
      "Order them by how strongly you would recommend them.",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: recommendationSchema,
    schemaName: "recommendations",
    maxTokens: 3000,
  });

export const packingList = async (input: PackingListInput) =>
  complete({
    system: SYSTEM,
    prompt: [
      `Build a packing list for ${input.days} days in ${input.destination}.`,
      input.season ? `Season or month: ${input.season}.` : "",
      input.activities ? `Planned activities: ${input.activities}.` : "",
      input.travellers ? `Travellers: ${input.travellers}.` : "",
      "Group items sensibly and mark the ones that are genuinely essential.",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: packingListSchema,
    schemaName: "packing_list",
    maxTokens: 3000,
  });

/**
 * The travel assistant.
 *
 * Stateless: the client sends the conversation so far, which keeps the server
 * from storing chat history it has no other use for. When a trip is named, its
 * route, dates and budget are handed to the model as context.
 */
export const assist = async (user: AuthenticatedUser, input: AssistantInput) => {
  let context = "";

  if (input.tripId) {
    const trip = await findEditableTrip(input.tripId, user);
    const stops = await prisma.tripStop.findMany({
      where: { tripId: trip.id },
      orderBy: { position: "asc" },
      include: { destination: { select: { name: true } } },
    });

    context = [
      `The traveller is asking about their trip "${trip.title}".`,
      trip.startDate
        ? `Dates: ${trip.startDate.toISOString().slice(0, 10)} to ${
            trip.endDate?.toISOString().slice(0, 10) ?? "open"
          }.`
        : "No dates set yet.",
      stops.length > 0
        ? `Route: ${stops.map((stop) => stop.destination.name).join(" -> ")}.`
        : "No destinations chosen yet.",
      trip.budgetTotal ? `Budget: ${trip.budgetTotal.toFixed(2)} ${trip.currencyCode ?? ""}.` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const history = (input.history ?? [])
    .map((turn) => `${turn.role === "user" ? "Traveller" : "You"}: ${turn.content}`)
    .join("\n");

  return complete({
    system: `${SYSTEM}

Answer as a conversational assistant. Keep replies under 200 words unless asked for detail. Offer up to 4 short follow-up suggestions.`,
    prompt: [context, history, `Traveller: ${input.message}`].filter(Boolean).join("\n\n"),
    schema: assistantReplySchema,
    schemaName: "assistant_reply",
    maxTokens: 2000,
  });
};
