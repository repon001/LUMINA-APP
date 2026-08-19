# Trip API

A journey: a title, dates, a budget, and an ordered route of destinations.

Postman setup: [docs/POSTMAN.md](../../../docs/POSTMAN.md). Design notes:
[trip.md](./trip.md).

| Method | Path                           | Auth     | Purpose                        |
| ------ | ------------------------------ | -------- | ------------------------------ |
| GET    | `/api/trips`                   | any user | My trips                       |
| POST   | `/api/trips`                   | any user | Create                         |
| GET    | `/api/trips/public`            | public   | Discover published itineraries |
| GET    | `/api/trips/shared/:shareCode` | public   | Open a shared link             |
| GET    | `/api/trips/:id`               | optional | One trip, if you may see it    |
| PATCH  | `/api/trips/:id`               | owner    | Update                         |
| DELETE | `/api/trips/:id`               | owner    | Delete                         |
| POST   | `/api/trips/:id/duplicate`     | any user | Copy into my account           |
| POST   | `/api/trips/:id/share`         | owner    | Publish or unlist              |
| DELETE | `/api/trips/:id/share`         | owner    | Back to private                |
| POST   | `/api/trips/:id/stops`         | owner    | Add a stop to the route        |
| PUT    | `/api/trips/:id/stops/order`   | owner    | Reorder the whole route        |
| PATCH  | `/api/trips/:id/stops/:stopId` | owner    | Edit one stop                  |
| DELETE | `/api/trips/:id/stops/:stopId` | owner    | Remove a stop                  |

"owner" means the owner or an ADMIN. A trip you may not see answers `404`, never
`403` — a `403` would confirm the id exists.

---

## POST /api/trips

```json
{
  "title": "Japan in autumn",
  "summary": "Dhaka to Tokyo, then south by rail.",
  "startDate": "2026-10-04",
  "endDate": "2026-10-18",
  "budgetTotal": 2400,
  "currencyCode": "usd",
  "tags": ["Food", "photography", "food"]
}
```

`201`. Dates are calendar days (`YYYY-MM-DD`), stored at midnight UTC. New trips
are `DRAFT` and `PRIVATE`. `budgetTotal` becomes `"2400.00"`, `currencyCode`
`"USD"`, tags `["food", "photography"]`.

| Failure                      | Code                     |
| ---------------------------- | ------------------------ |
| `endDate` before `startDate` | `422` on field `endDate` |
| Date not `YYYY-MM-DD`        | `422 VALIDATION_ERROR`   |
| No token                     | `401 UNAUTHORIZED`       |

## GET /api/trips

Your own trips only. `?status=PLANNED&tags=food&q=japan&sort=-updatedAt`.

Sortable: `title`, `startDate`, `endDate`, `status`, `createdAt`, `updatedAt`
(default `-updatedAt`). Filterable: `status`, `visibility`, `startDate`,
`endDate`, `tags`. `q` searches title, summary and tags.

Each card carries the route so a list screen can draw Dhaka → Tokyo → Kyoto
without a second request.

## GET /api/trips/:id

Returns the trip with `owner` and `stops` (ordered, each with its destination and
coordinates). Readable by the owner, an admin, anyone if `PUBLIC`, or with
`?shareCode=…` if `UNLISTED`. Otherwise `404`.

## PATCH /api/trips/:id

Any of `title`, `summary`, `coverImageUrl`, `startDate`, `endDate`, `status`,
`budgetTotal`, `currencyCode`, `tags`. Send `null` to clear an optional field.

`visibility` is **not** here — use the share endpoints, because changing it also
mints or drops a share code.

Statuses: `DRAFT`, `PLANNED`, `ONGOING`, `COMPLETED`, `CANCELLED`.

## POST /api/trips/:id/share

```json
{ "visibility": "UNLISTED", "regenerate": false }
```

```json
{ "data": { "id": "cmt0…", "visibility": "UNLISTED", "shareCode": "Xq7…24 chars" } }
```

- `UNLISTED` — reachable only through the code.
- `PUBLIC` — also listed in `/api/trips/public`.
- `regenerate: true` — mint a new code; every link already sent stops working.

Give the link out as `/api/trips/shared/{{shareCode}}`.

**Try it:** open `/api/trips/:id` with no token → `404`. Share it, then retry
with `?shareCode=…` → `200`. Regenerate, and the old code is `404` again.

## DELETE /api/trips/:id/share

Back to `PRIVATE`, code cleared. Any link handed out stops working immediately.

## POST /api/trips/:id/duplicate

```json
{ "title": "My version of Japan" }
```

`201` with a full copy — route included — owned by **you**, always `PRIVATE` and
`DRAFT`. Anyone who can view a trip can duplicate it, which is the point of
publishing one. Omit `title` and it becomes `"<original> (copy)"`.

## POST /api/trips/:id/stops

```json
{
  "destinationId": "cmt0b…",
  "position": 1,
  "arrivalDate": "2026-10-09",
  "departureDate": "2026-10-13",
  "transportToNext": "TRAIN",
  "notes": "Ryokan near Gion"
}
```

`201`. Omit `position` to append. Give one to insert: everything from there
shifts down, so positions stay `0..n-1` with no gaps. `transportToNext` describes
how you leave _this_ stop — `FLIGHT`, `TRAIN`, `BUS`, `CAR`, `FERRY`, `WALK`,
`OTHER` — and is null on the last one.

| Failure                              | Code              |
| ------------------------------------ | ----------------- |
| Unknown `destinationId`              | `404 NOT_FOUND`   |
| `departureDate` before `arrivalDate` | `400 BAD_REQUEST` |
| Not your trip                        | `404` / `403`     |

## PUT /api/trips/:id/stops/order

```json
{ "stopIds": ["stop_tokyo", "stop_osaka", "stop_kyoto"] }
```

Send **every** stop exactly once, in the new order; a partial list or a repeated
id is `400`. Returns the route renumbered from 0.

## DELETE /api/trips/:id/stops/:stopId

`200`, and the remaining stops close the gap — 0, 1, 2 with nothing missing.
