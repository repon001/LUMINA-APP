# User API

Account administration. Every route needs a token; most need `ADMIN`.

Postman setup: [docs/POSTMAN.md](../../../docs/POSTMAN.md). Why the rules are
what they are: [user.md](./user.md).

| Method | Path                   | Auth             | Purpose                    |
| ------ | ---------------------- | ---------------- | -------------------------- |
| PATCH  | `/api/users/me`        | Any signed-in    | Edit your own profile      |
| POST   | `/api/users/me/avatar` | Any signed-in    | Upload an avatar           |
| DELETE | `/api/users/me/avatar` | Any signed-in    | Remove your avatar         |
| GET    | `/api/users`           | ADMIN, MODERATOR | List, search, filter, page |
| POST   | `/api/users`           | ADMIN            | Create with a chosen role  |
| GET    | `/api/users/:id`       | ADMIN, MODERATOR | One account                |
| PATCH  | `/api/users/:id`       | ADMIN            | Update or deactivate       |

The `/me` routes are declared before `/:id`, or `me` would be read as a user id
and answer `403` for a request the user is entitled to make.

There is no `DELETE`: accounts are deactivated so their trips, reviews and
history stay attributable.

---

## PATCH /api/users/me

Your own account. Send only what changes.

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com"
}
```

`role` and `isActive` are **not accepted here** — they belong to the admin route.
Sending them is not an error; they are simply dropped.

To change a password, prove you know the current one:

```json
{
  "currentPassword": "Password123!",
  "password": "a-better-password"
}
```

| Response | When                                                |
| -------- | --------------------------------------------------- |
| `200`    | Updated. The whole user comes back                  |
| `400`    | Nothing to update, or the current password is wrong |
| `409`    | That email belongs to somebody else                 |

A successful password change revokes every refresh token you hold, so other
devices are signed out. The one that made the change keeps its access token
until it expires.

## POST /api/users/me/avatar

`multipart/form-data`, **not** JSON. In Postman: Body → form-data → set the key
to `avatar` and change its type from Text to **File**.

| Field    | Type | Notes                           |
| -------- | ---- | ------------------------------- |
| `avatar` | File | JPEG, PNG or WebP. 5 MB at most |

The file never touches this server's disk — multer streams it to Cloudinary as
it arrives, and what is stored is the delivered URL.

Uploads are cropped square to 512px around the face and converted to WebP, so
what the app downloads is a few kilobytes rather than a phone photograph.

| Response | When                                                    |
| -------- | ------------------------------------------------------- |
| `200`    | Uploaded. The user comes back with the new `avatarUrl`  |
| `400`    | Wrong type, too large, or no file in the `avatar` field |
| `503`    | The server has no Cloudinary credentials                |

Replacing an avatar deletes the previous file from Cloudinary, so the account
does not fill up with orphans.

## DELETE /api/users/me/avatar

No body. Clears `avatarUrl` and deletes the file. Answers `200` with the user.

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
