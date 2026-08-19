import { describe, expect, it } from "vitest";
import {
  createPlaceSchema,
  nearbyPlacesQuerySchema,
  updatePlaceSchema,
} from "../src/modules/place/place.validation";

const valid = {
  destinationId: "cmt0bilu0001",
  name: "Tokyo Tower",
  category: "ATTRACTION",
  latitude: 35.6586,
  longitude: 139.7454,
};

describe("createPlaceSchema", () => {
  it("normalises price to a fixed 2-decimal string", () => {
    expect(createPlaceSchema.parse({ ...valid, price: 1200 }).price).toBe("1200.00");
    expect(createPlaceSchema.parse({ ...valid, price: "12.5" }).price).toBe("12.50");
  });

  it("rejects a negative price", () => {
    expect(createPlaceSchema.safeParse({ ...valid, price: -5 }).success).toBe(false);
  });

  it("only accepts a known category", () => {
    expect(createPlaceSchema.safeParse({ ...valid, category: "CASTLE" }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...valid, category: "HOTEL" }).success).toBe(true);
  });

  it("keeps priceLevel within its 1-4 scale", () => {
    expect(createPlaceSchema.safeParse({ ...valid, priceLevel: 0 }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ ...valid, priceLevel: 5 }).success).toBe(false);
    expect(createPlaceSchema.parse({ ...valid, priceLevel: "3" }).priceLevel).toBe(3);
  });

  it("requires a destination", () => {
    const { destinationId, ...withoutDestination } = valid;
    expect(destinationId).toBeTruthy();
    expect(createPlaceSchema.safeParse(withoutDestination).success).toBe(false);
  });

  it("rejects a website that is not a url", () => {
    expect(createPlaceSchema.safeParse({ ...valid, website: "tokyo-tower" }).success).toBe(false);
  });
});

describe("updatePlaceSchema", () => {
  it("will not move a place to another destination", () => {
    const parsed = updatePlaceSchema.parse({
      name: "Renamed",
      destinationId: "somewhere-else",
    } as never);
    expect(parsed).toEqual({ name: "Renamed" });
  });

  it("refuses an empty body", () => {
    expect(updatePlaceSchema.safeParse({}).success).toBe(false);
  });
});

describe("nearbyPlacesQuerySchema", () => {
  it("defaults to a walkable 5 km", () => {
    expect(nearbyPlacesQuerySchema.parse({ lat: 35.6, lng: 139.7 }).radiusKm).toBe(5);
  });

  it("caps the radius tighter than destinations do", () => {
    expect(nearbyPlacesQuerySchema.safeParse({ lat: 0, lng: 0, radiusKm: 500 }).success).toBe(
      false,
    );
  });

  it("accepts an optional category filter", () => {
    expect(nearbyPlacesQuerySchema.parse({ lat: 0, lng: 0, category: "HOTEL" }).category).toBe(
      "HOTEL",
    );
  });
});
