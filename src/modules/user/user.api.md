# User API

Account administration. Every route needs a token; most need `ADMIN`.

Postman setup: [docs/POSTMAN.md](../../../docs/POSTMAN.md). Why the rules are
what they are: [user.md](./user.md).

| Method | Path             | Auth             | Purpose                    |
| ------ | ---------------- | ---------------- | -------------------------- |
| GET    | `/api/users`     | ADMIN, MODERATOR | List, search, filter, page |
| POST   | `/api/users`     | ADMIN            | Create with a chosen role  |
| GET    | `/api/users/:id` | ADMIN, MODERATOR | One account                |
| PATCH  | `/api/users/:id` | ADMIN            | Update or deactivate       |

There is no `DELETE`: accounts are deactivated so their trips, reviews and
history stay attributable.

---

## GET /api/users

`{{baseUrl}}/api/users?role=USER&isActive=true&q=sam&sort=name&page=1&limit=20`

| Query          | Meaning                                                |
| -------------- | ------------------------------------------------------ |
| `q`            | Partial match on name or email                         |
| `role`         | `ADMIN`, `MODERATOR`, `USER`                           |
| `isActive`     | `true` / `false`                                       |
| `createdAt`    | Exact, or `createdAt_gte` / `createdAt_lte` for ranges |
| `sort`         | `name`, `email`, `role`, `createdAt`, `updatedAt`      |
| `page`,`limit` | Defaults 1 and 20                                      |

`passwordHash` is never in a response — no query selects it.

## POST /api/users — ADMIN

```json
{
  "name": "Mo Moderator",
  "email": "moderator2@example.com",
  "password": "Password123!",
  "role": "MODERATOR"
}
```

`201` with the created account. This is the only way to create a non-`USER`
account; `/api/auth/register` always makes a plain traveller.

| Failure                     | Code                   |
| --------------------------- | ---------------------- |
| Field rule broken           | `422 VALIDATION_ERROR` |
| Email taken                 | `409 CONFLICT`         |
| Signed in as MODERATOR/USER | `403 FORBIDDEN`        |

## GET /api/users/:id

`200` with one account, or `404 NOT_FOUND`.

## PATCH /api/users/:id — ADMIN

Any subset of `name`, `email`, `password`, `role`, `isActive`; at least one.

```json
{ "role": "MODERATOR", "isActive": false }
```

| Failure                       | Code                                           |
| ----------------------------- | ---------------------------------------------- |
| Empty body                    | `422` "Provide at least one field to update"   |
| New email taken               | `409 CONFLICT`                                 |
| Deactivating your own account | `400` "You cannot deactivate your own account" |
| Changing your own role        | `400` "You cannot change your own role"        |

**Try it:** as admin, `PATCH` your own id with `{"isActive": false}` → `400`. The
guard is what stops the last admin locking everyone out.

**Try it:** `PATCH` another user with a new `password`, then use that user's old
`refreshToken` → `401`. Changing a password revokes every session they had.
