# Destination API

Cities and regions a trip is built around. Reading is public. Anyone signed in
may propose one, and it is held for review — see
[moderation.api.md](../moderation/moderation.api.md).

Postman setup (environment, token) is in [docs/POSTMAN.md](../../../docs/POSTMAN.md).

| Method | Path                          | Auth      | Purpose                      |
| ------ | ----------------------------- | --------- | ---------------------------- |
| GET    | `/api/destinations`           | public    | List, search, filter, page   |
| GET    | `/api/destinations/nearby`    | public    | Proximity search             |
| GET    | `/api/destinations/:idOrSlug` | public    | One destination              |
| POST   | `/api/destinations`           | Signed-in | Create, or submit for review |
| PATCH  | `/api/destinations/:id`       | ADMIN     | Update                       |
| DELETE | `/api/destinations/:id`       | ADMIN     | Delete (only when empty)     |

---

## GET /api/destinations

`{{baseUrl}}/api/destinations?q=tokyo&tags=food&isFeatured=true&sort=name&page=1&limit=20`

| Query          | Meaning                                                         |
| -------------- | --------------------------------------------------------------- |
| `q`            | Partial, case-insensitive match on name, country, description   |
| `countryCode`  | Exact, e.g. `JP`                                                |
| `tags`         | Has this tag. `tags_in=food,temples` matches any of them        |
| `isFeatured`   | `true` / `false`                                                |
| `isActive`     | `true` / `false`                                                |
| `sort`         | `name`, `country`, `createdAt`, `updatedAt`; `-` for descending |
| `page`,`limit` | Defaults 1 and 20, limit caps at 100                            |

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Destinations fetched",
  "data": [
    {
      "id": "cmt0bilu…",
      "slug": "tokyo",
      "name": "Tokyo",
      "country": "Japan",
      "countryCode": "JP",
      "latitude": "35.676200",
      "longitude": "139.650300",
      "coverImageUrl": null,
      "tags": ["food", "technology"],
      "isFeatured": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

Sorting by a field that is not on the list is `400 BAD_REQUEST` naming the
allowed ones. Unknown query parameters are ignored.

**Try it:** `?sort=isActive` → 400. `?tags=food&sort=-name` → Tokyo, Osaka.

## GET /api/destinations/nearby

`{{baseUrl}}/api/destinations/nearby?lat=35.0116&lng=135.7681&radiusKm=60&limit=20`

| Query      | Required | Default | Notes      |
| ---------- | -------- | ------- | ---------- |
| `lat`      | yes      | —       | -90 … 90   |
| `lng`      | yes      | —       | -180 … 180 |
| `radiusKm` | no       | 50      | max 2000   |
| `limit`    | no       | 20      | max 100    |

Returns active destinations inside the radius, nearest first, each with
`distanceKm`. `meta` echoes the centre and radius used.

```json
{
  "data": [
    { "slug": "kyoto", "name": "Kyoto", "distanceKm": 0 },
    { "slug": "osaka", "name": "Osaka", "distanceKm": 42.87 }
  ],
  "meta": { "center": { "lat": 35.0116, "lng": 135.7681 }, "radiusKm": 60 }
}
```

**Try it:** widen to `radiusKm=500` and Tokyo appears at `359.76`.

## GET /api/destinations/:idOrSlug

Takes either, so `/api/destinations/tokyo` and `/api/destinations/cmt0bilu…`
are the same record. Includes the full row plus `_count.places`.

`404 NOT_FOUND` when neither matches.

## POST /api/destinations — any signed-in user

```json
{
  "name": "Tokyo",
  "country": "Japan",
  "countryCode": "jp",
  "latitude": 35.6762,
  "longitude": 139.6503,
  "timezone": "Asia/Tokyo",
  "currencyCode": "jpy",
  "tags": ["Food", "Technology", "food"],
  "isFeatured": true,
  "description": "Neon, ramen and quiet shrines."
}
```

`201` with the created row. Note what the server normalises for you:

- `countryCode` → `JP`, `currencyCode` → `JPY`
- `tags` → `["food", "technology"]` (lowercased, de-duplicated)
- `slug` → `tokyo`, derived from the name. Send your own to override; a second
  "Tokyo" becomes `tokyo-2` rather than failing.

| Failure                               | Code                   |
| ------------------------------------- | ---------------------- |
| Bad coordinates, short name, bad code | `422 VALIDATION_ERROR` |
| `slug` you sent is taken              | `409 CONFLICT`         |
| No token                              | `401 UNAUTHORIZED`     |
| Signed in as MODERATOR or USER        | `403 FORBIDDEN`        |

**Try it in Postman:** log in as `user@example.com`, repeat the request → `403`.

## PATCH /api/destinations/:id — ADMIN

Any subset of the create fields, plus `isActive`. At least one is required, or
`422` with "Provide at least one field to update".

```json
{ "isFeatured": false, "tags": ["temples"] }
```

## DELETE /api/destinations/:id — ADMIN

`200` when the destination has no places. If it does, `409 CONFLICT` naming the
count — deactivate it with `PATCH { "isActive": false }` instead, which hides it
from `nearby` and from filtered lists without touching history.
