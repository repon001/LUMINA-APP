import { describe, expect, it } from "vitest";
import {
  addStopSchema,
  createTripSchema,
  reorderStopsSchema,
  shareTripSchema,
  updateTripSchema,
} from "../src/modules/trip/trip.validation";

describe("createTripSchema", () => {
  it("reads dates as calendar days at midnight UTC", () => {
    const parsed = createTripSchema.parse({ title: "Japan", startDate: "2026-10-04" });
    expect(parsed.startDate?.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("refuses a trip that ends before it starts", () => {
    const result = createTripSchema.safeParse({
      title: "Backwards",
      startDate: "2026-10-18",
      endDate: "2026-10-04",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["endDate"]);
  });

  it("accepts a trip that starts and ends the same day", () => {
    const result = createTripSchema.safeParse({
      title: "Day trip",
      startDate: "2026-10-04",
      endDate: "2026-10-04",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a date that is not YYYY-MM-DD", () => {
    expect(createTripSchema.safeParse({ title: "Japan", startDate: "04/10/2026" }).success).toBe(
      false,
    );
  });

  it("normalises budget and currency", () => {
    const parsed = createTripSchema.parse({
      title: "Japan",
      budgetTotal: 2400,
      currencyCode: "usd",
    });
    expect(parsed.budgetTotal).toBe("2400.00");
    expect(parsed.currencyCode).toBe("USD");
  });
});

describe("updateTripSchema", () => {
  it("allows clearing a date with null", () => {
    expect(updateTripSchema.parse({ endDate: null })).toEqual({ endDate: null });
  });

  it("does not accept visibility, which has its own endpoint", () => {
    expect(updateTripSchema.parse({ title: "Renamed", visibility: "PUBLIC" } as never)).toEqual({
      title: "Renamed",
    });
  });

  it("refuses an empty body", () => {
    expect(updateTripSchema.safeParse({}).success).toBe(false);
  });
});

describe("shareTripSchema", () => {
  it("only accepts the two shareable visibilities", () => {
    expect(shareTripSchema.safeParse({ visibility: "PUBLIC" }).success).toBe(true);
    expect(shareTripSchema.safeParse({ visibility: "UNLISTED" }).success).toBe(true);
    expect(shareTripSchema.safeParse({ visibility: "PRIVATE" }).success).toBe(false);
  });
});

describe("addStopSchema", () => {
  it("takes an optional position, coerced from the query-style string", () => {
    expect(addStopSchema.parse({ destinationId: "d1", position: "2" }).position).toBe(2);
    expect(addStopSchema.parse({ destinationId: "d1" }).position).toBeUndefined();
  });

  it("rejects a negative position", () => {
    expect(addStopSchema.safeParse({ destinationId: "d1", position: -1 }).success).toBe(false);
  });
});

describe("reorderStopsSchema", () => {
  it("needs at least one id", () => {
    expect(reorderStopsSchema.safeParse({ stopIds: [] }).success).toBe(false);
    expect(reorderStopsSchema.safeParse({ stopIds: ["a", "b"] }).success).toBe(true);
  });
});
