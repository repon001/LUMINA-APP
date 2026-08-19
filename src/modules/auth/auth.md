# Auth Module

Signs users in, keeps them signed in without long-lived access tokens, and makes
revoking access immediate.

Shared conventions (response envelope, error codes) live in
[`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md).

## Files

| File | Role |
|---|---|
| `auth.route.ts` | Mounts the five endpoints, applies validation |
| `auth.controller.ts` | Reads/writes the refresh cookie, shapes responses |
| `auth.service.ts` | Register, login, rotation, revocation, current user |
| `auth.validation.ts` | `loginSchema`, `registerSchema` |

Supporting code: [`utils/jwt.ts`](../../utils/jwt.ts) (signing, hashing),
[`utils/password.ts`](../../utils/password.ts) (bcrypt),
[`middleware/auth.ts`](../../middleware/auth.ts) (`authenticate`, `authorize`).

---

## How the feature works

### Two tokens, different jobs

- **Access token** — a JWT carrying `{ sub, email, role }`, TTL `15m`, sent on
  every request as `Authorization: Bearer <token>`. Never stored server-side.
- **Refresh token** — a JWT carrying `{ sub, jti }`, TTL `30d`, used only to
  obtain a new access token.

Short access tokens mean a stolen one expires quickly. The refresh token is the
valuable secret, so it is the one the server tracks.

### Refresh tokens are stored hashed

Only `SHA-256(token)` is written to `RefreshToken.tokenHash`, so a leaked
database dump contains nothing replayable.

SHA-256 rather than bcrypt on purpose: the token is already high-entropy random
data, so a slow hash would add latency to every refresh without adding
meaningful protection. Bcrypt is for *passwords*, where the input is low-entropy
and guessable.

### Rotation, and what happens on replay

Every call to `/refresh` revokes the presented token and issues a new pair, so a
refresh token is single-use. That gives a free theft signal — a second
presentation means two parties hold it:

```
verify JWT  →  look up SHA-256 hash
                 ├─ found, active     →  revoke it, issue new pair
                 ├─ found, revoked    →  revoke ALL user sessions, 401
                 ├─ found, expired    →  401
                 └─ not found         →  revoke ALL user sessions, 401
```

Revoked rows are kept rather than deleted, so a replayed token is normally
*found* — which is what makes the theft detectable at all.

### Revocation is immediate

`authenticate` re-reads the user on every request and rejects inactive accounts.
That costs one indexed primary-key read per request, and buys the property that
deactivating a user takes effect **now** rather than whenever their access token
happens to lapse.

Sessions are also revoked when a password changes or an account is deactivated
(see the [user module](../user/user.md)).

### Registration cannot mint an admin

`POST /register` ignores any role in the body and always creates a `USER`.
Elevating someone is an admin-only action on `PATCH /api/users/:id`. Drop the
route entirely if the app is invite-only.

### Credential routes are rate limited separately

`/register`, `/login` and `/refresh` sit behind a tighter limiter
(`AUTH_RATE_REQUEST_LIMIT`, default 10 per window) than the rest of the API.
It skips successful requests, so a real user signing in and out repeatedly is
never blocked while someone guessing passwords burns the budget in ten tries.

### Expired token rows are pruned as they are replaced

Issuing a token also deletes that user rows whose `expiresAt` has passed, so the
table does not grow forever without a scheduled job. The trade-off: replaying a
token that expired *and* was pruned lands in the "not found" branch and revokes
the family, rather than returning "expired". Every session of that user is long
dead by then, so the effect is a re-login either way.

### Login does not leak which emails exist

A missing user and a wrong password both return the same `401 Invalid email or
password`. A deactivated account is the one case that differs (`403`), because
the user needs to know to contact an admin rather than retry their password.

### Cookie *and* body

The refresh token is set as an HTTP-only cookie **and** returned in the body:

- Cookie (`refresh_token`, `httpOnly`, `sameSite=strict`, `path=/api/auth`,
  `secure` per `COOKIE_SECURE`) — for browsers, where JS must never touch it.
- Body — for native clients, which have no cookie jar and store it in the
  platform keychain.

`/refresh` and `/logout` read the cookie first and fall back to
`body.refreshToken`.

---

## How the API works

> **Envelope.** Every response also carries `statusCode`, `success` and
> `message`; error bodies add `error.code`. The first example shows the full
> shape; later ones are abbreviated to their `data` payload.

### `POST /api/auth/register` — public

```json
{ "name": "Sam User", "email": "sam@example.com", "password": "Password123!" }
```

`201` with the same payload as login. Role is always `USER`.

| Failure | Code |
|---|---|
| Name < 2 chars, bad email, password < 8 | `422 VALIDATION_ERROR` |
| Email taken | `409 CONFLICT` |

### `POST /api/auth/login` — public

```json
{ "email": "admin@example.com", "password": "Password123!" }
```

`200`

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Signed in",
  "data": {
    "user": { "id": "clx…", "name": "Ada Admin", "email": "admin@example.com", "role": "ADMIN" },
    "accessToken": "eyJ…",
    "refreshToken": "eyJ…"
  }
}
```

Also sets the `refresh_token` cookie.

| Failure | Code |
|---|---|
| Bad email format / missing password | `422 VALIDATION_ERROR` |
| Unknown email or wrong password | `401 UNAUTHORIZED` |
| Account deactivated | `403 FORBIDDEN` |

### `POST /api/auth/refresh`

No body required if the cookie is present; otherwise
`{ "refreshToken": "eyJ…" }`. Returns the same shape as login, with a **new**
access and refresh token.

| Failure | Code |
|---|---|
| No token supplied | `401 Missing refresh token` |
| Expired / bad signature | `401 Refresh token is invalid or expired` |
| Already rotated (replay) | `401 Refresh token has already been used` — **all sessions revoked** |
| Account deactivated | `403 FORBIDDEN` |

### `POST /api/auth/logout`

Revokes the presented token and clears the cookie. Deliberately idempotent —
logging out with no token, or an already-revoked one, still returns `200`.
Logout ends *this* session only; other devices stay signed in.

### `GET /api/auth/me` — authenticated

Returns `id`, `name`, `email`, `role`, `isActive`, `createdAt`.

---

## Using auth on other routes

```ts
router.use(authenticate);                          // 401 if no valid token
router.post("/", authorize(Role.ADMIN), handler);  // 403 if wrong role
```

`authorize` must run after `authenticate`; on its own it returns `401` because
`req.user` is unset. After `authenticate`, handlers may use `requireUser(req)` —
typed in [`types/express.d.ts`](../../types/express.d.ts).

## Edge cases

- `passwordHash` is never selected outside the service.
- Access tokens are **not** revocable — that is the trade-off for not storing
  them. The 15-minute TTL bounds the exposure; the active-account check in
  `authenticate` closes the account-disabled case immediately.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are distinct, so a refresh token
  can never be presented as an access token.
- Rotating either secret invalidates all outstanding tokens of that kind.
- Expired `RefreshToken` rows are not auto-pruned; `expiresAt` is indexed for a
  future cleanup job.
