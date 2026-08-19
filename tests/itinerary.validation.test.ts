import { describe, expect, it } from "vitest";
import {
  addDaySchema,
  addItemSchema,
  moveItemSchema,
  updateItemSchema,
} from "../src/modules/itinerary/itinerary.validation";

describe("addDaySchema", () => {
  it("takes an optional 1-based day number", () => {
    expect(addDaySchema.parse({ dayNumber: "2" }).dayNumber).toBe(2);
    expect(addDaySchema.parse({}).dayNumber).toBeUndefined();
  });

  it("rejects day zero, since days start at one", () => {
    expect(addDaySchema.safeParse({ dayNumber: 0 }).success).toBe(false);
  });
});

describe("addItemSchema", () => {
  it("accepts a 24-hour wall-clock time", () => {
    expect(addItemSchema.parse({ title: "Ramen", startTime: "09:30" }).startTime).toBe("09:30");
    expect(addItemSchema.parse({ title: "Late", startTime: "23:59" }).startTime).toBe("23:59");
  });

  it("rejects anything that is not HH:MM", () => {
    for (const startTime of ["9am", "9:30", "24:00", "12:60", "2026-10-04T09:30"]) {
      expect(addItemSchema.safeParse({ title: "X", startTime }).success).toBe(false);
    }
  });

  it("refuses an item that ends before it starts", () => {
    const result = addItemSchema.safeParse({ title: "X", startTime: "18:00", endTime: "09:00" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["endTime"]);
  });

  it("allows one time without the other", () => {
    expect(addItemSchema.safeParse({ title: "X", startTime: "09:00" }).success).toBe(true);
    expect(addItemSchema.safeParse({ title: "X", endTime: "09:00" }).success).toBe(true);
  });

  it("defaults kind to a place visit, and only accepts known kinds", () => {
    expect(addItemSchema.parse({ title: "X" }).kind).toBeUndefined();
    expect(addItemSchema.safeParse({ title: "X", kind: "MEAL" }).success).toBe(true);
    expect(addItemSchema.safeParse({ title: "X", kind: "SIGHTSEEING" }).success).toBe(false);
  });

  it("normalises cost the same way money is normalised everywhere", () => {
    expect(addItemSchema.parse({ title: "Ramen", cost: 1500 }).cost).toBe("1500.00");
  });

  it("requires a title", () => {
    expect(addItemSchema.safeParse({ startTime: "09:00" }).success).toBe(false);
    expect(addItemSchema.safeParse({ title: "  " }).success).toBe(false);
  });
});

describe("updateItemSchema", () => {
  it("allows detaching a place or clearing a time with null", () => {
    expect(updateItemSchema.parse({ placeId: null })).toEqual({ placeId: null });
    expect(updateItemSchema.parse({ startTime: null })).toEqual({ startTime: null });
  });

  it("refuses an empty body", () => {
    expect(updateItemSchema.safeParse({}).success).toBe(false);
  });
});

describe("moveItemSchema", () => {
  it("needs a destination day and takes an optional position", () => {
    expect(moveItemSchema.parse({ toDayId: "day_2", position: "0" })).toEqual({
      toDayId: "day_2",
      position: 0,
    });
    expect(moveItemSchema.safeParse({ position: 0 }).success).toBe(false);
  });
});
