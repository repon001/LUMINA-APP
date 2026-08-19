const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export interface Point {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

/** Great-circle distance in kilometres. */
export const distanceKm = (from: Point, to: Point): number => {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
};

/**
 * The square that contains a radius around a point.
 *
 * Distance itself is a trigonometric expression the database cannot answer from
 * an index. So a proximity search first takes the rows inside this box - a
 * plain indexed range scan - and only then measures the survivors exactly.
 *
 * Longitude degrees shrink towards the poles, hence the cosine term. Near the
 * poles that term collapses, so the span is clamped to the whole world rather
 * than dividing by something close to zero.
 */
export const boundingBox = (center: Point, radiusKm: number): BoundingBox => {
  const latSpan = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const cosLat = Math.cos(toRadians(center.latitude));
  const lngSpan = Math.abs(cosLat) < 1e-6 ? 180 : latSpan / Math.abs(cosLat);

  return {
    minLatitude: Math.max(center.latitude - latSpan, -90),
    maxLatitude: Math.min(center.latitude + latSpan, 90),
    minLongitude: Math.max(center.longitude - lngSpan, -180),
    maxLongitude: Math.min(center.longitude + lngSpan, 180),
  };
};

/** Rounded to 10 m, which is finer than any consumer GPS fix. */
export const roundKm = (km: number): number => Math.round(km * 100) / 100;
