# Place API

Everything inside a destination: attractions, hotels, restaurants, activities,
shopping, nightlife, transport. Reading is public. Anyone signed in may propose
one, and it is held for review — see
[moderation.api.md](../moderation/moderation.api.md).

Postman setup: [docs/POSTMAN.md](../../../docs/POSTMAN.md). Design notes:
[place.md](./place.md).

| Method | Path                 | Auth      | Purpose                      |
| ------ | -------------------- | --------- | ---------------------------- |
| GET    | `/api/places`        | public    | List, search, filter, page   |
| GET    | `/api/places/nearby` | public    | What is around me            |
| GET    | `/api/places/:id`    | public    | One place with its city      |
| POST   | `/api/places`        | Signed-in | Create, or submit for review |
| PATCH  | `/api/places/:id`    | ADMIN     | Update                       |
| DELETE | `/api/places/:id`    | ADMIN     | Delete                       |

Categories: `ATTRACTION`, `HOTEL`, `RESTAURANT`, `ACTIVITY`, `SHOPPING`,
`NIGHTLIFE`, `TRANSPORT`, `OTHER`.

---

## GET /api/places

`{{baseUrl}}/api/places?destination=tokyo&category=RESTAURANT&priceLevel_lte=2&sort=-ratingAvg`

| Query           | Meaning                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| `q`             | Name, description, address — or an exact tag                                                  |
| `destination`   | Destination **slug**, e.g. `tokyo`                                                            |
| `destinationId` | Destination id, if you already have it                                                        |
| `category`      | One of the categories above                                                                   |
| `tags`          | Has this tag; `tags_in=ramen,sushi` matches any                                               |
| `priceLevel`    | 1–4. Ranges with `priceLevel_gte` / `priceLevel_lte`                                          |
| `ratingAvg_gte` | e.g. `4` for "4 stars and up"                                                                 |
| `isActive`      | `true` / `false`                                                                              |
| `sort`          | `name`, `ratingAvg`, `ratingCount`, `priceLevel`, `price`, `createdAt` (default `-ratingAvg`) |
| `page`, `limit` | Defaults 1 and 20                                                                             |

```json
{
  "data": [
    {
      "id": "cmt0c…",
      "slug": "ichiran-shibuya",
      "name": "Ichiran Shibuya",
      "category": "RESTAURANT",
      "latitude": "35.659100",
      "longitude": "139.700600",
      "priceLevel": 1,
      "price": null,
      "currencyCode": null,
      "tags": ["ramen", "food"],
      "ratingAvg": "0",
      "ratingCount": 0,
      "destination": { "id": "cmt0b…", "slug": "tokyo", "name": "Tokyo" }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

**Try it:** `?q=ramen` finds Ichiran even though "ramen" is only a tag, because
`q` checks tags by exact membership as well as text fields by partial match.

## GET /api/places/nearby

`{{baseUrl}}/api/places/nearby?lat=35.6595&lng=139.7005&radiusKm=3&category=RESTAURANT`

| Query      | Required | Default | Notes                           |
| ---------- | -------- | ------- | ------------------------------- |
| `lat`      | yes      | —       | -90 … 90                        |
| `lng`      | yes      | —       | -180 … 180                      |
| `radiusKm` | no       | 5       | max 200 — this is a city search |
| `limit`    | no       | 20      | max 100                         |
| `category` | no       | —       | Narrow to hotels, food, …       |

Nearest first, each with `distanceKm`. Only active places.

**Try it:** from Shibuya, `radiusKm=3` returns the ramen shop at `0.05` km;
widening to `10` with `category=HOTEL` returns Park Hyatt at `3.02` km.

## GET /api/places/:id

The full row plus its destination (`id`, `slug`, `name`, `timezone`). `404` if
the id is unknown.

## POST /api/places — any signed-in user

```json
{
  "destinationId": "cmt0b…",
  "name": "Tokyo Tower",
  "category": "ATTRACTION",
  "latitude": 35.6586,
  "longitude": 139.7454,
  "address": "4-2-8 Shibakoen",
  "priceLevel": 2,
  "price": 1200,
  "currencyCode": "jpy",
  "tags": ["Views", "Photography"]
}
```

`201`. As with destinations: `slug` is derived from the name if omitted (a second
"Tokyo Tower" becomes `tokyo-tower-2`), tags are lowercased and de-duplicated,
`currencyCode` is uppercased, and `price` is normalised to `"1200.00"`.

| Failure                                     | Code                   |
| ------------------------------------------- | ---------------------- |
| Unknown category, name < 2, bad coordinates | `422 VALIDATION_ERROR` |
| `destinationId` matches nothing             | `404 NOT_FOUND`        |
| `slug` you sent is taken in that city       | `409 CONFLICT`         |
| Not signed in                               | `401`                  |
| Same name within 200 m in that destination  | `409`                  |

## PATCH /api/places/:id — ADMIN

Any subset of the create fields except `destinationId`, plus `isActive`. A place
cannot be moved between cities — its slug is unique per destination and
itineraries assume the city stays put. Sending `destinationId` is ignored, not
an error.

## DELETE /api/places/:id — ADMIN

`200`, or `404` if it is already gone. Prefer `PATCH { "isActive": false }` for a
place that closed: it disappears from `nearby` and filtered lists while any
itinerary that references it keeps working.
