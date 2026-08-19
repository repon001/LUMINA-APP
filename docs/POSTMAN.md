# Testing the API in Postman

One-time setup. Every module's `*.api.md` assumes it.

## 1. Environment

Create a Postman environment called **LUMINA local** with:

| Variable       | Initial value           |
| -------------- | ----------------------- |
| `baseUrl`      | `http://localhost:4000` |
| `accessToken`  | _(leave empty)_         |
| `refreshToken` | _(leave empty)_         |

Select it in the top-right environment picker, then use `{{baseUrl}}` in every
request URL.

## 2. Start the API

```bash
npm run dev        # http://localhost:4000
npm run seed       # admin@example.com / moderator@ / user@ — password Password123!
```

Check it is up: `GET {{baseUrl}}/health` → `200`.

## 3. Log in once, stay logged in

Create `POST {{baseUrl}}/api/auth/login`, body → raw → JSON:

```json
{ "email": "admin@example.com", "password": "Password123!" }
```

On the request's **Scripts → Post-response** tab, paste:

```js
const body = pm.response.json();
pm.environment.set("accessToken", body.data.accessToken);
pm.environment.set("refreshToken", body.data.refreshToken);
```

Now every login refreshes the token automatically.

## 4. Send the token with protected requests

On the **collection** (not each request): Authorization → Type **Bearer Token** →
Token `{{accessToken}}`. Child requests inherit it, and public endpoints ignore it.

Access tokens last 15 minutes. When you start getting `401 UNAUTHORIZED`, either
re-run login or `POST {{baseUrl}}/api/auth/refresh` with:

```json
{ "refreshToken": "{{refreshToken}}" }
```

## 5. What every response looks like

Success:

```json
{ "statusCode": 200, "success": true, "message": "…", "data": {}, "meta": {} }
```

Failure:

```json
{
  "statusCode": 404,
  "success": false,
  "message": "Destination not found",
  "error": { "code": "NOT_FOUND", "requestId": "0b0f…" }
}
```

`error.code` is the stable value to branch on — see
[ARCHITECTURE.md](./ARCHITECTURE.md#2-error-codes). Quote `requestId` when
reporting a bug; it matches the `x-request-id` response header and the server log
line.

## 6. Roles

Three seeded accounts, same password. Log in as the one the endpoint requires:

| Account                 | Role      | Can                                 |
| ----------------------- | --------- | ----------------------------------- |
| `admin@example.com`     | ADMIN     | everything, including the catalogue |
| `moderator@example.com` | MODERATOR | read users, moderate content        |
| `user@example.com`      | USER      | normal traveller actions            |

A wrong role returns `403 FORBIDDEN`, a missing/expired token `401 UNAUTHORIZED`.
