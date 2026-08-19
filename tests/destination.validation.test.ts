import { describe, expect, it } from "vitest";
import {
  createDestinationSchema,
  nearbyQuerySchema,
  updateDestinationSchema,
} from "../src/modules/destination/destination.validation";

const valid = {
  name: "Tokyo",
  country: "Japan",
  countryCode: "jp",
  latitude: 35.6762,
  longitude: 139.6503,
};

describe("createDestinationSchema", () => {
  it("normalises country and currency codes to uppercase", () => {
    const parsed = createDestinationSchema.parse({ ...valid, currencyCode: "jpy" });
    expect(parsed.countryCode).toBe("JP");
    expect(parsed.currencyCode).toBe("JPY");
  });

  it("lowercases tags and drops duplicates", () => {
    const parsed = createDestinationSchema.parse({ ...valid, tags: ["Food", "food", "Tech"] });
    expect(parsed.tags).toEqual(["food", "tech"]);
  });

  it("leaves the slug out so the service can derive one", () => {
    expect(createDestinationSchema.parse(valid).slug).toBeUndefined();
  });

  it("rejects a slug that is not url-safe", () => {
    const result = createDestinationSchema.safeParse({ ...valid, slug: "Tokyo City!" });
    expect(result.success).toBe(false);
  });

  it("rejects coordinates outside the globe", () => {
    expect(createDestinationSchema.safeParse({ ...valid, latitude: 91 }).success).toBe(false);
    expect(createDestinationSchema.safeParse({ ...valid, longitude: -181 }).success).toBe(false);
  });

  it("rejects a country code that is not two letters", () => {
    expect(createDestinationSchema.safeParse({ ...valid, countryCode: "JPN" }).success).toBe(false);
  });

  it("rejects a cover image that is not a url", () => {
    expect(
      createDestinationSchema.safeParse({ ...valid, coverImageUrl: "not-a-url" }).success,
    ).toBe(false);
  });
});

describe("updateDestinationSchema", () => {
  it("accepts a single field", () => {
    expect(updateDestinationSchema.parse({ isFeatured: true })).toEqual({ isFeatured: true });
  });

  it("refuses an empty body", () => {
    const result = updateDestinationSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Provide at least one field to update");
  });
});

describe("nearbyQuerySchema", () => {
  it("coerces query strings and applies defaults", () => {
    expect(nearbyQuerySchema.parse({ lat: "35.01", lng: "135.76" })).toEqual({
      lat: 35.01,
      lng: 135.76,
      radiusKm: 50,
      limit: 20,
    });
  });

  it("caps the radius so a search cannot mean the whole planet", () => {
    expect(nearbyQuerySchema.safeParse({ lat: 0, lng: 0, radiusKm: 20000 }).success).toBe(false);
  });

  it("requires both coordinates", () => {
    expect(nearbyQuerySchema.safeParse({ lat: 35.01 }).success).toBe(false);
  });
});
