# Destination Module

The catalogue every trip is built from: a city or region with coordinates, a
timezone, a currency and some tags.

Endpoints and Postman steps: [destination.api.md](./destination.api.md).
Shared conventions: [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).

## Files

| File                        | Role                                     |
| --------------------------- | ---------------------------------------- |
| `destination.route.ts`      | Paths, public vs ADMIN gates, validation |
| `destination.controller.ts` | Request → service, response envelope     |
| `destination.service.ts`    | Listing, proximity, create/update/delete |
| `destination.validation.ts` | Zod schemas and inferred input types     |

Supporting code: [`utils/geo.ts`](../../utils/geo.ts) (distance, bounding box),
[`utils/slug.ts`](../../utils/slug.ts).

---

## How the feature works

### Reading is public, writing is not

The app shows destinations before anyone signs in, so the three `GET`s are open.
The catalogue is curated rather than user-generated, so `POST`/`PATCH`/`DELETE`
require `ADMIN`. That split is the whole authorisation story for this module.

### Proximity search is two steps, on purpose

Distance is trigonometry, and Postgres cannot answer it from an index. Sorting
every row by distance would mean a sequential scan of the entire table.

So `nearby` runs an indexed range scan over the bounding box that contains the
radius, then measures the survivors exactly in memory:

```
   bounding box (indexed, cheap)      circle (exact, in memory)
   ┌───────────────┐                  ┌───────────────┐
   │ • • • • • • • │                  │    ╭───────╮  │
   │ •   ╭───────╮ │        →         │   ╱ • • • • ╲ │
   │ •   │ • • • │ │                  │  │ • • • • • ││
   │ • • ╰───────╯ │                  │   ╲ • • • • ╱ │
   └───────────────┘                  └───────────────┘
   @@index([latitude, longitude])     corners dropped by radius filter
```

The box has corners the radius does not reach, which is why the distance filter
still runs afterwards. `CANDIDATE_LIMIT` (500) bounds the in-memory half; the box
for any sane "near me" radius holds far fewer.

Longitude degrees narrow towards the poles, so the box widens by `1/cos(lat)` —
and clamps instead of dividing by ~0 at the poles. See
[`tests/geo.test.ts`](../../../tests/geo.test.ts).

### Slugs are derived, and never collide

`POST` may omit `slug`; the service derives one from the name and counts up
(`tokyo`, `tokyo-2`, `tokyo-3`) until it finds a free one. Accents fold rather
than drop, so "Kyōto" becomes `kyoto`, not `kyto`.

An explicitly supplied slug is different: a clash is a `409` rather than being
silently renamed, because the caller asked for that exact value.

### Input is normalised at the edge

The Zod schemas uppercase `countryCode`/`currencyCode` and lowercase and
de-duplicate `tags`. Doing it in validation rather than in the service means
every write path gets it, and `?tags=food` cannot miss a row stored as `Food`.

### Delete refuses to cascade

`onDelete: Cascade` on `Place` means deleting a destination would take its places
with it. That is right for referential integrity and wrong as an accident, so the
service refuses while any place remains and points at deactivation instead.

`isActive: false` keeps the row and its history, and drops it out of `nearby`.

### Coordinates are Decimal, not Float

They are compared, indexed and echoed back to a client that may round-trip them.
A binary float would make two "identical" points differ in the last place. Prisma
returns `Decimal`, so the service converts with `Number()` only where the maths
happens.

## Edge cases

- `GET /:idOrSlug` accepts both, so links can be readable without an extra lookup.
- A destination with no coordinates is impossible: both are required at creation.
- `nearby` only returns active destinations; the list endpoint returns all unless
  you filter, so an admin can still find what they deactivated.
- The rating and place counts shown on a detail response come from `_count`, not
  from a stored counter, so they cannot drift.
