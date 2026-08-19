# Auth API

Sign up, sign in, keep a session alive, sign out.

Postman setup (environment, saving the token) is in
[docs/POSTMAN.md](../../../docs/POSTMAN.md). How the tokens actually work:
[auth.md](./auth.md).

| Method | Path                 | Auth          | Purpose                         |
| ------ | -------------------- | ------------- | ------------------------------- |
| POST   | `/api/auth/register` | public        | Create a traveller account      |
| POST   | `/api/auth/login`    | public        | Exchange credentials for tokens |
| POST   | `/api/auth/refresh`  | refresh token | New access + refresh pair       |
| POST   | `/api/auth/logout`   | refresh token | End this session                |
| GET    | `/api/auth/me`       | access token  | The signed-in user              |

`/register`, `/login` and `/refresh` are rate limited to
`AUTH_RATE_REQUEST_LIMIT` (default 10) failures per window per IP.

---

## POST /api/auth/register

```json
{ "name": "Sam Traveller", "email": "sam@example.com", "password": "Password123!" }
```

`201`

```json
{
  "statusCode": 201,
  "success": true,
  "message": "Account created",
  "data": {
    "user": { "id": "cmt0…", "name": "Sam Traveller", "email": "sam@example.com", "role": "USER" },
    "accessToken": "eyJ…",
    "refreshToken": "eyJ…"
  }
}
```

Role is always `USER` — a `role` in the body is ignored, so this endpoint cannot
mint an admin. Also sets the `refresh_token` cookie (`httpOnly`, `path=/api/auth`).

| Failure                                     | Code                   |
| ------------------------------------------- | ---------------------- |
| Name < 2 chars, invalid email, password < 8 | `422 VALIDATION_ERROR` |
| Email already registered                    | `409 CONFLICT`         |
| Too many attempts                           | `429 RATE_LIMITED`     |

## POST /api/auth/login

```json
{ "email": "admin@example.com", "password": "Password123!" }
```

`200` with the same shape as register. Put this in Postman first and add the
post-response script from the setup guide — every later request then has a token.

| Failure                         | Code                   |
| ------------------------------- | ---------------------- |
| Unknown email or wrong password | `401 UNAUTHORIZED`     |
| Account deactivated             | `403 FORBIDDEN`        |
| Malformed body                  | `422 VALIDATION_ERROR` |

Unknown email and wrong password return the identical message, so the endpoint
cannot be used to discover which addresses exist.

## POST /api/auth/refresh

Body is optional when the cookie is present. Native clients send:

```json
{ "refreshToken": "{{refreshToken}}" }
```

`200` with a **new** access and refresh token; the presented one is revoked.

**Try it:** send the same `refreshToken` twice. The second call returns
`401 Refresh token has already been used` — and every session for that user is
revoked, because two parties holding one token means it leaked.

## POST /api/auth/logout

Revokes the presented token and clears the cookie. Always `200`, even with no
token — logging out twice is not an error. Other devices stay signed in.

## GET /api/auth/me

Requires `Authorization: Bearer {{accessToken}}`.

```json
{
  "data": {
    "id": "cmt0…",
    "name": "Ada Admin",
    "email": "admin@example.com",
    "role": "ADMIN",
    "isActive": true,
    "createdAt": "2026-08-19T16:38:21.350Z"
  }
}
```

**Try it:** wait for the 15-minute access token to expire, or edit one character
of the token → `401 Access token is invalid or expired`. Then call `/refresh` and
retry.
