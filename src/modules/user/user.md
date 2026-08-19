# User Module

Accounts: who exists, what role they hold, and whether they can still sign in.

Shared conventions live in [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md).

## Files

| File | Role |
|---|---|
| `user.route.ts` | Endpoints and role gates |
| `user.controller.ts` | Request → service, response envelope |
| `user.service.ts` | Listing, creation, updates, session revocation |
| `user.validation.ts` | `createUserSchema`, `updateUserSchema` |

---

## How the feature works

### Roles

`ADMIN`, `MANAGER`, `USER` — defined once in `prisma/schema/user.prisma` and
consumed by Zod via `z.enum(Role)`, so adding a role to the schema automatically
extends validation. No hand-maintained list to drift.

Rename or extend them for the domain: the only code that names a specific role
is the `authorize(...)` call in each route file.

### `passwordHash` never leaves the service

Every query uses a single `USER_SELECT` constant that omits it. There is no code
path returning a user object straight from Prisma, so the hash cannot leak
through a forgotten `include`.

Passwords are bcrypt-hashed at cost 12 (see
[`utils/password.ts`](../../utils/password.ts)).

### Password and deactivation changes end sessions

Changing a password or setting `isActive: false` revokes every outstanding
refresh token for that user:

```ts
if (input.password !== undefined || input.isActive === false) {
  await prisma.refreshToken.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
```

Without this, "reset their password because it leaked" would leave the attacker
signed in for up to 30 days. Combined with the active-account check in
`authenticate` (see the [auth module](../auth/auth.md)), a deactivated user
loses access on their very next request.

### Admins cannot lock themselves out

Two self-targeted edits are refused:

- deactivating your own account
- changing your own role

Otherwise the last remaining admin could demote themselves and leave the system
with no one able to manage users. Admins *can* still change their own name,
email and password.

### Email uniqueness

Checked in the service for a clear `409`, and also enforced by a `UNIQUE`
constraint in Postgres. The check is a courtesy; the constraint is the guarantee.
If two requests race, the loser `P2002` is mapped to the same `409` by the
central error handler.

---

## How the API works

All routes require authentication.

| Method | Path | Access |
|---|---|---|
| GET | `/api/users` | ADMIN, MANAGER |
| POST | `/api/users` | ADMIN |
| GET | `/api/users/:id` | ADMIN, MANAGER |
| PATCH | `/api/users/:id` | ADMIN |

Note there is no `DELETE`. Users are deactivated, not removed — records
elsewhere reference them, and history must stay attributable. Add a hard delete
only if nothing else points at a user.

### `GET /api/users`

Runs through the shared [query builder](../../utils/query-builder.ts).

| Capability | Values |
|---|---|
| Sort | `name`, `email`, `role`, `createdAt`, `updatedAt` (default `-createdAt`) |
| Filter | `role` (enum), `isActive` (bool), `createdAt` (date, with `_gte`/`_lte`/…) |
| Search `q` | `name`, `email` |

```
GET /api/users?role=USER&isActive=true&q=sam&sort=name&page=1&limit=20
```

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Users fetched",
  "data": [
    { "id": "clx…", "name": "Sam User", "email": "user@example.com",
      "role": "USER", "isActive": true,
      "createdAt": "2026-08-01T10:00:00.000Z", "updatedAt": "2026-08-01T10:00:00.000Z" }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

### `POST /api/users` — ADMIN

```json
{ "name": "Mia Manager", "email": "manager@example.com", "password": "Password123!", "role": "MANAGER" }
```

`201` with the created user. Rules: name 2–120 chars, valid email, password ≥ 8
chars, role must be one of the three.

| Failure | Code |
|---|---|
| Field rule broken | `422 VALIDATION_ERROR` |
| Email taken | `409 CONFLICT` |
| Caller is not ADMIN | `403 FORBIDDEN` |

Unlike `/api/auth/register`, this route *does* take a role — which is why it is
admin-only.

### `GET /api/users/:id`

`200` with one user, or `404 NOT_FOUND`.

### `PATCH /api/users/:id` — ADMIN

Every field optional, but at least one is required:

```json
{ "role": "MANAGER", "isActive": false }
```

| Failure | Code |
|---|---|
| Empty body | `422` — "Provide at least one field to update" |
| New email taken | `409 CONFLICT` |
| Deactivating yourself | `400` — "You cannot deactivate your own account" |
| Changing your own role | `400` — "You cannot change your own role" |
| No such user | `404 NOT_FOUND` |

Passing `password` re-hashes it and revokes all that user sessions.

## Edge cases

- Setting `role` to its current value on your own account is allowed — the guard
  only fires on an actual change.
- Deactivating a user does not touch their historical records.
- Managers can read users but cannot create or modify them.
- Seeded accounts share one password from `SEED_PASSWORD` (default
  `Password123!`) — development only.
