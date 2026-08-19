# Itinerary API

The day-by-day plan inside a trip: Day 1, Day 2, each holding an ordered list of
cards. This is what the app animates when you swipe between days.

Postman setup: [docs/POSTMAN.md](../../../docs/POSTMAN.md). Design notes:
[itinerary.md](./itinerary.md).

All paths are nested under a trip. Permissions follow the trip itself: read if
you can read the trip (including via a share link), write only if you own it.

| Method | Path                                                | Auth     |
| ------ | --------------------------------------------------- | -------- |
| GET    | `/api/trips/:tripId/days`                           | optional |
| POST   | `/api/trips/:tripId/days`                           | owner    |
| PUT    | `/api/trips/:tripId/days/order`                     | owner    |
| PATCH  | `/api/trips/:tripId/days/:dayId`                    | owner    |
| DELETE | `/api/trips/:tripId/days/:dayId`                    | owner    |
| POST   | `/api/trips/:tripId/days/:dayId/items`              | owner    |
| PUT    | `/api/trips/:tripId/days/:dayId/items/order`        | owner    |
| POST   | `/api/trips/:tripId/days/:dayId/items/:itemId/move` | owner    |
| PATCH  | `/api/trips/:tripId/days/:dayId/items/:itemId`      | owner    |
| DELETE | `/api/trips/:tripId/days/:dayId/items/:itemId`      | owner    |

Item kinds: `PLACE`, `TRANSPORT`, `MEAL`, `ACCOMMODATION`, `ACTIVITY`, `NOTE`.

---

## GET /api/trips/:tripId/days

The whole itinerary in one call: days in order, each with its items in order,
each item with its place (id, slug, name, category, coordinates, image) when it
has one.

```json
{
  "data": [
    {
      "id": "cmt0d…",
      "dayNumber": 1,
      "date": null,
      "title": "Arrival",
      "items": [
        {
          "id": "cmt0e…",
          "position": 0,
          "kind": "TRANSPORT",
          "title": "Land at Haneda",
          "startTime": "07:15",
          "endTime": "08:00",
          "transportMode": "FLIGHT",
          "cost": null,
          "place": null
        },
        {
          "id": "cmt0f…",
          "position": 1,
          "kind": "MEAL",
          "title": "Ramen",
          "startTime": "12:30",
          "cost": "1500.00",
          "currencyCode": "JPY",
          "place": {
            "slug": "ichiran-shibuya",
            "name": "Ichiran Shibuya",
            "category": "RESTAURANT"
          }
        }
      ]
    }
  ]
}
```

For a shared trip, append `?shareCode=…` — the same code that opens the trip.

## POST /api/trips/:tripId/days

```json
{ "dayNumber": 2, "title": "Akihabara", "date": "2026-10-05" }
```

`201`. Omit `dayNumber` to append. Give one and the day is inserted there:
existing days shift down and stay numbered `1..n` with no gaps.

`date` is optional — an itinerary can be planned before the dates are fixed.

## PUT /api/trips/:tripId/days/order

```json
{ "dayIds": ["day_4", "day_1", "day_2", "day_3"] }
```

Send every day exactly once. Returns the itinerary renumbered from 1.

## PATCH /api/trips/:tripId/days/:dayId

`title`, `notes`, `date` — any subset, `null` to clear. `dayNumber` is not
editable here; use the order endpoint, which keeps the whole sequence consistent.

## DELETE /api/trips/:tripId/days/:dayId

Deletes the day **and its items**, then closes the numbering gap.

## POST /api/trips/:tripId/days/:dayId/items

```json
{
  "title": "Ramen",
  "kind": "MEAL",
  "placeId": "cmt0c…",
  "startTime": "12:30",
  "endTime": "13:15",
  "cost": 1500,
  "currencyCode": "jpy",
  "position": 0,
  "notes": "Queue before noon"
}
```

`201`. Only `title` is required — a card can be "lunch somewhere near the
station" before a place is chosen. Times are wall-clock at the destination
(`HH:MM`), never timestamps. Omit `position` to append.

| Failure                       | Code                   |
| ----------------------------- | ---------------------- |
| `endTime` before `startTime`  | `422` on `endTime`     |
| Time not `HH:MM` (e.g. `9am`) | `422 VALIDATION_ERROR` |
| Unknown `placeId`             | `404 NOT_FOUND`        |
| Day not on this trip          | `404 NOT_FOUND`        |
| Not your trip                 | `404` / `403`          |

## PUT /api/trips/:tripId/days/:dayId/items/order

```json
{ "itemIds": ["item_c", "item_b", "item_a"] }
```

Every item of that day, exactly once. Returns them renumbered from 0.

## POST /api/trips/:tripId/days/:dayId/items/:itemId/move

The drag-and-drop endpoint.

```json
{ "toDayId": "day_2", "position": 0 }
```

Moves a card to another day (or within the same day) at the given position.
Both days are renumbered in one transaction, so neither is left with a gap or a
duplicate position. Omit `position` to drop it at the end.

**Try it:** move the last card of Day 1 to `position: 0` of Day 2, then `GET`
the itinerary — Day 1 closes its gap and Day 2 shifts down to make room.

## PATCH /api/trips/:tripId/days/:dayId/items/:itemId

Any subset of the create fields. `null` clears an optional one — including
`placeId`, which detaches the card from the catalogue without deleting it.

## DELETE /api/trips/:tripId/days/:dayId/items/:itemId

`200`, and the remaining cards close the gap.
