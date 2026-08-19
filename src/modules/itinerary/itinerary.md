# Itinerary Module

Days and the cards on them. A trip's route says _where_; the itinerary says
_when_, and it is the structure the app turns into a swipeable timeline.

Endpoints and Postman steps: [itinerary.api.md](./itinerary.api.md).

## Files

| File                      | Role                                       |
| ------------------------- | ------------------------------------------ |
| `itinerary.route.ts`      | Nested paths under a trip, auth per route  |
| `itinerary.controller.ts` | Request → service, response envelope       |
| `itinerary.service.ts`    | Days, items, ordering, moving between days |
| `itinerary.validation.ts` | Zod schemas and inferred input types       |

Permissions come from [`trip.access.ts`](../trip/trip.access.ts) — this module
has no rules of its own.

---

## How the feature works

### Days are numbered, not dated

`dayNumber` is 1-based and contiguous; `date` is optional. A traveller plans
"day 1, day 2, day 3" long before committing to a departure date, and moving the
trip a week later should not mean rewriting every day.

When dates do exist, `date` carries them — derived from the trip, never the
source of truth for ordering.

### Items are cards, and only the title is required

An itinerary is written before it is decided. "Lunch somewhere near the station"
is a real plan, so `placeId` is optional and can be filled in later — or cleared
with `null` without deleting the card.

`kind` (`PLACE`, `TRANSPORT`, `MEAL`, `ACCOMMODATION`, `ACTIVITY`, `NOTE`) is
what lets the client pick an icon and an animation without guessing from the
title.

### Times are wall-clock, deliberately

`startTime` and `endTime` are `"09:30"` strings, not timestamps.

A plan says "09:30 local". Storing an instant would mean the same lunch appears
at a different time as soon as the trip crosses a timezone — or as soon as the
server's zone differs from the traveller's. The destination's timezone is on the
`Destination` row when a real instant is needed for a notification.

They also sort correctly as strings, because `HH:MM` is zero-padded.

### Ordering is the same two-pass trick, three times over

Days, items within a day, and route stops are all unique on
`(parent, position)`. Positions therefore cannot be shuffled in place, so every
reorder parks the rows above the used range and then writes them back down —
see [`utils/ordering.ts`](../../utils/ordering.ts).

Insertion always creates the row at the end, where nothing can collide, and then
renumbers with it spliced into place. Deletion renumbers what remains. The
invariant is that positions are always `0..n-1` (days `1..n`) with no holes.

### Moving a card is one transaction across two days

`POST …/items/:itemId/move` is the app's main gesture. The item is parked at the
end of the destination day, then the source day closes its gap and the
destination opens one:

```
   before                      move item 2 of D1 -> D2 position 0
   D1[ a, b, c ]               D1[ a, b ]
   D2[ x, y ]                  D2[ c, x, y ]
```

Both renumbering passes run inside the same transaction, so a failure halfway
cannot leave a card on two days or on none.

### Deleting a place does not delete the plan

`ItineraryItem.placeId` is `onDelete: SetNull`. If a restaurant is removed from
the catalogue, the card stays with its title and time and simply loses its link.
A `Cascade` there would silently delete part of someone's holiday.

## Edge cases

- A day belonging to another trip is `404`, even for an admin, because the path
  asserts a relationship that does not hold.
- Reordering demands the complete list; a partial one is `400`. The client always
  has the full day on screen, so sending it is free.
- Moving an item to the day it is already on is allowed, and behaves as a
  reposition within that day.
- `date` on a day is not validated against the trip's own start and end. Editing
  a trip mid-plan would otherwise refuse changes the traveller is in the middle
  of making; the client shows the mismatch instead.
