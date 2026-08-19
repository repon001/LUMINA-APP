import { describe, expect, it } from "vitest";
import { boundingBox, distanceKm, roundKm } from "../src/utils/geo";

const TOKYO = { latitude: 35.6762, longitude: 139.6503 };
const KYOTO = { latitude: 35.0116, longitude: 135.7681 };
const SHIBUYA = { latitude: 35.6595, longitude: 139.7005 };

describe("distanceKm", () => {
  it("measures a known city pair", () => {
    // Tokyo to Kyoto is ~360 km great-circle (rail distance is longer).
    expect(distanceKm(TOKYO, KYOTO)).toBeCloseTo(360, 0);
  });

  it("measures a short hop inside a city", () => {
    expect(roundKm(distanceKm(TOKYO, SHIBUYA))).toBeLessThan(5);
  });

  it("is zero for the same point and symmetric between two", () => {
    expect(distanceKm(TOKYO, TOKYO)).toBe(0);
    expect(distanceKm(TOKYO, KYOTO)).toBeCloseTo(distanceKm(KYOTO, TOKYO), 9);
  });
});

describe("boundingBox", () => {
  it("contains every point inside the radius", () => {
    const box = boundingBox(TOKYO, 10);

    expect(SHIBUYA.latitude).toBeGreaterThan(box.minLatitude);
    expect(SHIBUYA.latitude).toBeLessThan(box.maxLatitude);
    expect(SHIBUYA.longitude).toBeGreaterThan(box.minLongitude);
    expect(SHIBUYA.longitude).toBeLessThan(box.maxLongitude);
  });

  it("grows with the radius", () => {
    const small = boundingBox(TOKYO, 5);
    const large = boundingBox(TOKYO, 50);

    expect(large.maxLatitude).toBeGreaterThan(small.maxLatitude);
    expect(large.minLongitude).toBeLessThan(small.minLongitude);
  });

  it("widens longitude towards the poles, where a degree is shorter", () => {
    const equator = boundingBox({ latitude: 0, longitude: 0 }, 100);
    const arctic = boundingBox({ latitude: 70, longitude: 0 }, 100);

    const span = (b: { minLongitude: number; maxLongitude: number }) =>
      b.maxLongitude - b.minLongitude;
    expect(span(arctic)).toBeGreaterThan(span(equator));
  });

  it("clamps at the poles instead of dividing by zero", () => {
    const pole = boundingBox({ latitude: 90, longitude: 0 }, 100);

    expect(pole.maxLatitude).toBe(90);
    expect(pole.minLongitude).toBe(-180);
    expect(pole.maxLongitude).toBe(180);
  });

  it("clamps at the antimeridian rather than wrapping past it", () => {
    const box = boundingBox({ latitude: 0, longitude: 179 }, 500);
    expect(box.maxLongitude).toBe(180);
  });
});
