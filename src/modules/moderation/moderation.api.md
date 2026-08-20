# Moderation API

Reviewing what people have submitted to the catalogue.

Postman setup: [docs/POSTMAN.md](../../../docs/POSTMAN.md). Why the rules are
what they are: [moderation.md](./moderation.md).

| Method | Path                                | Auth             |
| ------ | ----------------------------------- | ---------------- |
| GET    | `/api/moderation/mine`              | Any signed-in    |
| GET    | `/api/moderation/queue`             | ADMIN, MODERATOR |
| GET    | `/api/moderation/counts`            | ADMIN, MODERATOR |
| POST   | `/api/moderation/:kind/:id/approve` | ADMIN, MODERATOR |
| POST   | `/api/moderation/:kind/:id/reject`  | ADMIN, MODERATOR |

`:kind` is `destination` or `place`. Anything else is a `422`.

`/mine` is declared before the moderator gate — seeing your own submissions is
the whole point of being told one is in review.

---

## Submitting

There is no separate submission endpoint. The existing create routes now take
any signed-in user:

```
POST {{baseUrl}}/api/destinations
POST {{baseUrl}}/api/places
```

The response message tells you which happened:

| Sent by              | Status     | Message                            |
| -------------------- | ---------- | ---------------------------------- |
| A user               | `PENDING`  | "Destination submitted for review" |
| A moderator or admin | `APPROVED` | "Destination created"              |

Two things a submitter cannot do: set `isFeatured` (it is forced to `false`),
and add a place that already exists — a place with the same name within 200 m in
the same destination is refused with `409` and the existing id in
`error.details.existingId`.

Both routes are rate limited per user via `SUBMISSION_RATE_REQUEST_LIMIT`
(default 20 per window), because every submission becomes work for a human.

## GET /api/moderation/queue

`{{baseUrl}}/api/moderation/queue?kind=place&status=PENDING&page=1&limit=20`

| Query           | Meaning                                     |
| --------------- | ------------------------------------------- |
| `kind`          | `destination` (default) or `place`          |
| `status`        | `PENDING` (default), `APPROVED`, `REJECTED` |
| `page`, `limit` | Defaults 1 and 20; max limit 100            |

Oldest first. A queue sorted newest-first starves the entries that have waited
longest, which are exactly the ones somebody is asking about.

Each row carries `submittedBy` (id, name, email) so a reviewer can see who sent
it without a second call.

## GET /api/moderation/counts

```json
{ "destinations": 1, "places": 0, "total": 1 }
```

For a badge, without loading either list.

## POST /api/moderation/:kind/:id/approve

No body. Stamps `reviewedById` and `reviewedAt`, and the entry becomes public
immediately.

## POST /api/moderation/:kind/:id/reject

```json
{ "note": "The coordinates are in the sea." }
```

`note` is required and at least 3 characters. It is the only thing the
contributor sees, and a rejection with no reason produces the same submission
again next week.

| Response | When                                                                |
| -------- | ------------------------------------------------------------------- |
| `200`    | Decided                                                             |
| `404`    | No submission with that id                                          |
| `409`    | Already approved or rejected — see [moderation.md](./moderation.md) |
| `422`    | Missing reason, or a `:kind` that is not a thing                    |

## GET /api/moderation/mine

```json
{
  "destinations": [{ "name": "Nara", "status": "PENDING", "reviewNote": null }],
  "places": []
}
```

Everything you have submitted, newest first, whatever state it is in — including
`reviewNote` when something was turned down.
