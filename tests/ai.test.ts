import { describe, expect, it } from "vitest";
import { generatedPlanSchema, packingListSchema } from "../src/modules/ai/ai.schemas";
import { assistantSchema, planTripSchema, recommendSchema } from "../src/modules/ai/ai.validation";

const item = {
  title: "Morning temple",
  kind: "PLACE",
  startTime: "08:00",
  endTime: "10:00",
  placeName: "Kiyomizu-dera",
  notes: "Go early.",
  estimatedCost: 4,
};

const plan = {
  tripTitle: "Kyoto in spring",
  overview: "Three balanced days.",
  currencyCode: "USD",
  estimatedTotal: 585.5,
  days: [{ dayNumber: 1, title: "Eastern Kyoto", summary: "On foot.", items: [item] }],
  tips: ["Carry cash."],
};

describe("generatedPlanSchema", () => {
  it("accepts a well-formed plan", () => {
    expect(generatedPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("rejects a time the itinerary module could not store", () => {
    const bad = { ...plan, days: [{ ...plan.days[0], items: [{ ...item, startTime: "8am" }] }] };
    expect(generatedPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown item kind", () => {
    const bad = { ...plan, days: [{ ...plan.days[0], items: [{ ...item, kind: "SIGHTSEEING" }] }] };
    expect(generatedPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a day with no items", () => {
    const bad = { ...plan, days: [{ ...plan.days[0], items: [] }] };
    expect(generatedPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a currency that is not three letters", () => {
    expect(generatedPlanSchema.safeParse({ ...plan, currencyCode: "DOLLAR" }).success).toBe(false);
  });

  it("rejects a negative cost", () => {
    const bad = { ...plan, days: [{ ...plan.days[0], items: [{ ...item, estimatedCost: -1 }] }] };
    expect(generatedPlanSchema.safeParse(bad).success).toBe(false);
  });
});

describe("packingListSchema", () => {
  it("needs at least one group with at least one item", () => {
    expect(packingListSchema.safeParse({ summary: "s", groups: [] }).success).toBe(false);
    expect(
      packingListSchema.safeParse({
        summary: "s",
        groups: [
          {
            group: "Clothing",
            items: [{ item: "Jacket", quantity: 1, essential: true, why: "rain" }],
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("planTripSchema", () => {
  it("coerces numbers and keeps the trip to a plannable length", () => {
    expect(planTripSchema.parse({ destination: "Kyoto", days: "3" }).days).toBe(3);
    expect(planTripSchema.safeParse({ destination: "Kyoto", days: 31 }).success).toBe(false);
    expect(planTripSchema.safeParse({ destination: "Kyoto", days: 0 }).success).toBe(false);
  });

  it("requires somewhere to go", () => {
    expect(planTripSchema.safeParse({ days: 3 }).success).toBe(false);
  });

  it("uppercases the currency like every other money field", () => {
    expect(
      planTripSchema.parse({ destination: "Kyoto", days: 2, currencyCode: "usd" }).currencyCode,
    ).toBe("USD");
  });
});

describe("recommendSchema", () => {
  it("defaults and caps the number of suggestions", () => {
    expect(recommendSchema.parse({ destination: "Kyoto" }).limit).toBe(8);
    expect(recommendSchema.safeParse({ destination: "Kyoto", limit: 50 }).success).toBe(false);
  });
});

describe("assistantSchema", () => {
  it("takes a bounded history, since the client owns the conversation", () => {
    const history = Array.from({ length: 21 }, () => ({ role: "user" as const, content: "hi" }));
    expect(assistantSchema.safeParse({ message: "hi", history }).success).toBe(false);
    expect(assistantSchema.safeParse({ message: "hi", history: history.slice(0, 5) }).success).toBe(
      true,
    );
  });

  it("rejects an empty question", () => {
    expect(assistantSchema.safeParse({ message: "   " }).success).toBe(false);
  });
});
