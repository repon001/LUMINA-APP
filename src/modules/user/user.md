# User Module

Accounts: who exists, what role they hold, and whether they can still sign in.

Shared conventions live in [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md).

## Files

| File                 | Role                                           |
| -------------------- | ---------------------------------------------- |
| `user.route.ts`      | Endpoints and role gates                       |
| `user.controller.ts` | Request → service, response envelope           |
| `user.service.ts`    | Listing, creation, updates, session revocation |
| `user.validation.ts` | `createUserSchema`, `updateUserSchema`         |

---

## How the feature works

### Roles

`ADMIN`, `MODERATOR`, `USER` — defined once in `prisma/schema/user.prisma` and
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
with no one able to manage users. Admins _can_ still change their own name,
email and password.

### Email uniqueness

Checked in the service for a clear `409`, and also enforced by a `UNIQUE`
constraint in Postgres. The check is a courtesy; the constraint is the guarantee.
If two requests race, the loser `P2002` is mapped to the same `409` by the
central error handler.

---

## How the API works

Endpoints, payloads, failure codes and Postman steps live in
[user.api.md](./user.api.md).

---

## Edge cases

- Setting `role` to its current value on your own account is allowed — the guard
  only fires on an actual change.
- Deactivating a user does not touch their historical records.
- Moderators can read users but cannot create or modify them.
- Seeded accounts share one password from `SEED_PASSWORD` (default
  `Password123!`) — development only.
