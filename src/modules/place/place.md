# Place Module

What a traveller actually does in a city: an attraction to see, a hotel to sleep
in, a restaurant to eat at. Every place belongs to exactly one destination.

Endpoints and Postman steps: [place.api.md](./place.api.md).

## Files

| File                  | Role                                     |
| --------------------- | ---------------------------------------- |
| `place.route.ts`      | Paths, public vs ADMIN gates, validation |
| `place.controller.ts` | Request → service, response envelope     |
| `place.service.ts`    | Listing, proximity, create/update/delete |
| `place.validation.ts` | Zod schemas and inferred input types     |

---

## How the feature works

### One model, not six

A hotel, a ramen shop and a temple differ in what you do with them, not in what
the server stores: a name, a point on the map, a price and some tags. So they
share one table with a `category` enum, rather than six near-identical models
each needing its own endpoints, search and permissions.

Where they genuinely differ is price, and that is handled by two fields:

- `priceLevel` (1–4) — comparable across countries and currencies, and the one
  the app filters on.
- `price` + `currencyCode` — the real number when it is known: a nightly rate for
  a hotel, a ticket for an attraction. `Decimal`, never a float.

### Slugs are unique per destination, not globally

`@@unique([destinationId, slug])`. Every large city has a "central station", and
forcing globally unique slugs would produce `central-station-7`. Uniqueness is
scoped to the city, so `tokyo/senso-ji` and `kyoto/senso-ji` can both exist.

### A place cannot change city

`updatePlaceSchema` omits `destinationId`, so the field is dropped rather than
rejected. Moving a place would break its slug uniqueness and quietly relocate
every itinerary that references it. A place that moved city is a new place.

### Ratings are stored, not counted on read

`ratingAvg` and `ratingCount` live on the row and are written by the review
module inside the same transaction as the review. Listing 50 places would
otherwise mean 50 aggregate queries, and sorting by rating would be impossible
to index.

### Proximity works exactly like destinations

Bounding box first (indexed), exact distance second (in memory) — the reasoning
is in [destination.md](../destination/destination.md#proximity-search-is-two-steps-on-purpose).
The radius default and cap are tighter here: 5 km by default, 200 km maximum,
because "places near me" is a walk, not a flight.

### Searching finds tags as well as text

`?q=ramen` matches the shop whose _tag_ is `ramen`, not just names containing
the word. Text fields are matched partially and case-insensitively; tags are
matched exactly, because a partial match on an array column cannot use an index.

## Edge cases

- Creating a place under an unknown destination is `404`, not a foreign-key
  `500` — the service checks first and says which side is missing.
- `DELETE` is a real delete. Once reviews and itineraries reference places, the
  service will refuse it the way destinations already do; for a place that simply
  closed, `isActive: false` is the right answer today.
- A place with `isActive: false` stays visible to `GET /api/places` unless you
  filter, so an admin can find what they hid, but never appears in `nearby`.
- `price` is optional on purpose: most attractions have no single ticket price,
  and an invented `0` would sort as "free".
