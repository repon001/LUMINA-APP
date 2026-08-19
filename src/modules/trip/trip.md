# Trip Module

The centre of LUMINA: a journey with dates, a budget, and an ordered route —
Dhaka → Tokyo → Kyoto → Osaka — that the app animates.

Endpoints and Postman steps: [trip.api.md](./trip.api.md).

## Files

| File                 | Role                                             |
| -------------------- | ------------------------------------------------ |
| `trip.route.ts`      | Paths and which of them need a token             |
| `trip.controller.ts` | Request → service, response envelope             |
| `trip.service.ts`    | Trips, stops, sharing, duplication               |
| `trip.access.ts`     | Who may view and who may edit — all in one place |
| `trip.validation.ts` | Zod schemas and inferred input types             |

---

## How the feature works

### Access lives in one file

Every endpoint funnels through `findViewableTrip` or `findEditableTrip` rather
than repeating `if (trip.ownerId !== user.id)`. Two pure predicates decide:

```
canView  = owner | admin | PUBLIC | (UNLISTED && correct share code)
canEdit  = owner | admin
```

They are pure, so they are unit-tested directly
([tests/trip.access.test.ts](../../../tests/trip.access.test.ts)) instead of
through five HTTP round-trips. When collaborators arrive, this file is the only
one that changes.

### A trip you cannot see is a 404, not a 403

`403` says "this exists, but not for you" — which tells an attacker probing ids
that they found something real. A private trip answers exactly like a trip that
was never created.

The one exception is deliberate: someone who _can_ read a trip but not edit it
gets `403` on a write, because they already know it exists.

### Three visibilities, one share code

- `PRIVATE` — owner and admin only.
- `UNLISTED` — anyone holding the code; not in the public feed.
- `PUBLIC` — listed for everyone.

The code is 18 random bytes as base64url, minted when a trip is first shared and
kept across an unlisted → public change so links already sent keep working.
`regenerate: true` mints a new one and every old link dies — the whole point of
storing the code rather than deriving it from the id.

Visibility deliberately is not part of `PATCH`. Publishing is a different action
from renaming, and it has a side effect (minting a code) that a general update
endpoint should not hide.

### The route is an order, not a set

`TripStop.position` with `@@unique([tripId, position])` is what makes
Tokyo → Kyoto → Osaka different from Osaka → Tokyo → Kyoto.

That uniqueness makes shuffling in place impossible: the first update would
collide with a row that has not moved yet. So `renumber` parks every stop above
the used range and then writes the final positions:

```
   want: [B, C, A]

   pass 1 (park)          pass 2 (land)
   B: 0 -> 10000          B: 10000 -> 0
   C: 1 -> 10001          C: 10001 -> 1
   A: 2 -> 10002          A: 10002 -> 2
```

Both passes run inside one transaction, so a failure halfway leaves the original
order intact.

Insertion uses the same idea from the cheap end: the new stop is created at the
end, where nothing can collide, then the whole route is renumbered with it spliced
into place. Deleting closes the gap, so positions are always `0..n-1`.

### Reordering demands the whole route

`PUT /stops/order` rejects a partial list. Accepting one would mean inventing an
order for the stops left out — silently, and differently depending on how the
rows happened to come back. The client always knows the full route; sending it is
one line and removes the ambiguity.

### Duplication is how a public trip becomes yours

Anyone who can view a trip can copy it, including its stops. The copy is owned by
the caller, `PRIVATE`, and back to `DRAFT`: it is their plan now, not a shared
view of someone else's. That is what makes publishing an itinerary useful rather
than merely decorative.

### Dates are days

`startDate`, `endDate`, `arrivalDate` and `departureDate` are `@db.Date`, taken
as `YYYY-MM-DD` and pinned to midnight UTC. A phone in Dhaka and a server in UTC
must agree on which day the flight leaves; a timestamp would not guarantee that.

Ordering is checked in validation for a create, and again in the service for an
update — a request may change only one side, so the other has to come from the
stored row.

## Edge cases

- `GET /api/trips` is scoped to the caller; there is no way to list someone
  else's private trips, admin included. Admin access is per-trip, by id.
- Deleting a trip cascades to its stops. Destinations are `onDelete: Restrict`,
  so a destination in use cannot vanish underneath a route.
- A stop can carry dates outside the trip's own range; the app shows the
  mismatch rather than the API refusing an itinerary mid-edit.
- `shareCode` is unique across all trips, so a leaked code identifies exactly one.
- Duplicating your own trip is allowed — it is the natural "start from last year's
  trip" flow.
