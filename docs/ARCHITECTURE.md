# Architecture & Conventions

Shared contracts every module follows. Module-specific behaviour lives in the
`.md` next to each module.

## 1. Response envelope

Every response — success or failure — has the same top-level shape, so a client
parses one thing.

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Users fetched",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0,
    "hasNext": false,
    "hasPrev": false
  }
}
```

```json
{
  "statusCode": 409,
  "success": false,
  "message": "A user with this email already exists",
  "error": { "code": "CONFLICT" }
}
```

`data` is present on success, `error` on failure, `meta` only on lists.
`statusCode` is echoed in the body so a logged or proxied payload still shows
the outcome without its HTTP headers.

Built by [`utils/api-response.ts`](../src/utils/api-response.ts)
(`sendResponse`, `sendPaginated`) and
[`middleware/error-handler.ts`](../src/middleware/error-handler.ts).

## 2. Error codes

`error.code` is the stable, machine-readable value clients branch on. The HTTP
status may be shared by several codes; the code never changes meaning.

| Code                  | Status | Raised when                                      |
| --------------------- | ------ | ------------------------------------------------ |
| `BAD_REQUEST`         | 400    | Malformed input a schema cannot express          |
| `UNAUTHORIZED`        | 401    | Missing, invalid or expired access token         |
| `FORBIDDEN`           | 403    | Authenticated but the role is not allowed        |
| `NOT_FOUND`           | 404    | No such record, or no such route                 |
| `CONFLICT`            | 409    | Unique constraint, e.g. a taken email            |
| `VALIDATION_ERROR`    | 422    | Zod rejected the body/query/params               |
| `RATE_LIMITED`        | 429    | Over the per-IP window                           |
| `TRANSIENT_CONFLICT`  | 503    | Contended transaction (`P2028`, `P2034`) — retry |
| `SERVICE_UNAVAILABLE` | 503    | A dependency is down (readiness probe)           |
| `DATABASE_ERROR`      | 500    | Unmapped Prisma failure                          |
| `INTERNAL_ERROR`      | 500    | Anything unexpected — a bug                      |

Only an `ApiError` describes itself to the client. Anything else becomes a
generic 500, so internal detail never leaks. Stacks appear on 5xx outside
production only.

Failure bodies also carry `error.requestId`, matching the `x-request-id`
response header — quote it in a bug report and the log line is one grep away.

## 3. Request ids

[`middleware/request-id.ts`](../src/middleware/request-id.ts) stamps every
request with an id and echoes it as `x-request-id`. A caller-supplied id is
reused so a trace survives across services, but only if it is short and matches
`[\w.:-]+` — the value ends up in logs and response bodies, and an arbitrary
header should not be able to inject into either.

## 4. Layers

```
route        mount path, auth gate, validation
  ↓
controller   read request, call service, send envelope. No business logic.
  ↓
service      the actual work. Prisma lives here, Express does not.
  ↓
prisma       schema and migrations
```

A service never touches `req` or `res`, so it stays callable from a script, a
job or a test. A controller never runs a query.

## 5. List endpoints

Any listing goes through
[`utils/query-builder.ts`](../src/utils/query-builder.ts), which turns a query
string into Prisma `findMany` arguments against an allow-list.

| Param                                        | Meaning                                                    |
| -------------------------------------------- | ---------------------------------------------------------- |
| `page`, `limit`                              | 1-based paging; `limit` capped by `maxLimit` (default 100) |
| `sort`                                       | `sort=-createdAt,name` — leading `-` is descending         |
| `q`                                          | Case-insensitive partial match across `searchable` fields  |
| `<field>`                                    | Exact match, if declared in `filterable`                   |
| `<field>_gte` `_gt` `_lte` `_lt` `_ne` `_in` | Range / negation / comma-separated set                     |

Unknown parameters are dropped, never forwarded — a client cannot filter or
sort on a column the endpoint did not opt into. An unsortable field is a `400`
naming the allowed set.

## 6. Auth

- Access token: JWT `{ sub, email, role }`, 15m, sent as `Authorization: Bearer`.
- Refresh token: JWT `{ sub, jti }`, 30d, stored as a SHA-256 hash, rotated on
  every use, revoked family-wide on replay.
- `authenticate` re-reads the user each request, so deactivation is immediate.
- `authorize(...roles)` gates by role and must run after `authenticate`.

See [`src/modules/auth/auth.md`](../src/modules/auth/auth.md).

## 7. Adding a module

Copy the shape of `src/modules/user`:

```
src/modules/<name>/
  <name>.route.ts        # router, auth gates, validate({ body, query, params })
  <name>.controller.ts   # catchAsync handlers, sendResponse / sendPaginated
  <name>.service.ts      # Prisma work, ApiError for expected failures
  <name>.validation.ts   # Zod schemas + inferred input types
  <name>.md              # how the feature and its endpoints behave
```

Then add the model to `prisma/schema/<name>.prisma`, mount the router in
[`src/routes.ts`](../src/routes.ts), and run `npm run prisma:migrate`.

Rules of thumb:

- Derive Zod enums from the Prisma enum (`z.enum(Role)`) so they cannot drift.
- Define a `SELECT` constant per model and never return a raw Prisma row, so a
  sensitive column cannot leak through a forgotten `include`.
- Throw `ApiError` for anything the client should understand; let everything
  else hit the 500 path.
- Money in `Decimal` columns, validated with `money()` — never a JS float.

## 8. Tests

`tests/` mirrors the two things worth covering without a database:

- **Pure logic** — the query builder, JWT and password helpers. Fast, exact.
- **The pipeline** — supertest against `createApp()` for routes that answer
  before any query: `/health`, unknown routes, validation failures, auth gates.

`vitest.config.ts` sets the test environment, so the suite never reads a
developer `.env` or reaches a real database. Anything that genuinely needs
Postgres belongs in a separate, opt-in suite.
