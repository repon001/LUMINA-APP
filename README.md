# LUMINA APP

Backend for **LUMINA**, a cinematic travel-planning app: destinations, trips,
animated itineraries, budgets and AI planning, served to a React Native client.

Express 5, Prisma 7, PostgreSQL, JWT auth with rotating refresh tokens. Each
feature is one module — route, controller, service, validation and its own docs —
over shared infrastructure.

![Node](https://img.shields.io/badge/Node-24-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.2-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.9-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Contents

- [What you get](#what-you-get)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [Design decisions](#design-decisions)
- [Adding a module](#adding-a-module)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [License](#license)

---

## What you get

| Capability                 | Summary                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Auth**                   | Register, login, `/me`, logout. Access token + rotating refresh token, replay detection, immediate revocation.         |
| **RBAC**                   | `authorize(...roles)` per route; roles come from the Prisma enum, so validation cannot drift.                          |
| **One response envelope**  | Success and failure share the same shape, with a stable `error.code` to branch on.                                     |
| **Central error handling** | Zod and Prisma errors mapped to correct statuses; unexpected errors never leak internals.                              |
| **Validated env**          | Zod-parsed at boot. A missing secret fails at startup, not at 3am on the first request.                                |
| **List query builder**     | Paging, sorting, filtering with operators and search — from an allow-list, so clients cannot reach undeclared columns. |
| **Security defaults**      | helmet, CORS allow-list, hpp, per-IP rate limiting (tighter on auth), bcrypt cost 12.                                  |
| **Traceable requests**     | Every request carries an `x-request-id`, logged with errors and returned in failure bodies.                            |
| **Tests**                  | Vitest suite covering the query builder, auth helpers and the middleware pipeline. No database required.               |
| **Graceful shutdown**      | SIGINT/SIGTERM drain the server and disconnect Prisma, with a hard 10s backstop.                                       |
| **Docker**                 | Multi-stage build, non-root runtime.                                                                                   |

## Getting started

### Prerequisites

- Node.js ≥ 20 (24 recommended)
- PostgreSQL 14+ running somewhere you can reach

### Install

```bash
npm install
cp .env.example .env      # then edit DATABASE_URL and the two JWT secrets
npm run prisma:generate
npm run prisma:migrate    # creates the schema and the first migration
npm run seed              # optional: one account per role
npm run dev
```

The API listens on `http://localhost:4000`. Check it:

```bash
curl http://localhost:4000/health
```

Seeded accounts (password `Password123!`, override with `SEED_PASSWORD`):

| Email                   | Role      |
| ----------------------- | --------- |
| `admin@example.com`     | ADMIN     |
| `moderator@example.com` | MODERATOR |
| `user@example.com`      | USER      |

### Environment

Every variable is validated in [`src/config/env.ts`](src/config/env.ts); the app
refuses to boot on a bad one, and refuses to boot production with the example
secrets.

| Variable             | Default                 | Notes                                         |
| -------------------- | ----------------------- | --------------------------------------------- |
| `NODE_ENV`           | `development`           |                                               |
| `PORT`               | `4000`                  |                                               |
| `CORS_ORIGINS`       | `http://localhost:3000` | Comma-separated allow-list                    |
| `DATABASE_URL`       | —                       | Required                                      |
| `DIRECT_URL`         | —                       | Only when `DATABASE_URL` is a pooled endpoint |
| `JWT_ACCESS_SECRET`  | —                       | Required, ≥ 16 chars                          |
| `JWT_REFRESH_SECRET` | —                       | Required, ≥ 16 chars, must differ             |
| `ACCESS_TOKEN_TTL`   | `15m`                   |                                               |
| `REFRESH_TOKEN_TTL`  | `30d`                   |                                               |
| `COOKIE_SECURE`      | `false`                 | Set `true` behind HTTPS                       |
| `RATE_TIME_LIMIT`    | `15`                    | Window, minutes                               |
| `RATE_REQUEST_LIMIT` | `100`                   | Requests per window per IP                    |

## Project structure

```
prisma/
  schema/              # split per domain, not one giant file
    schema.prisma      # generator + datasource
    user.prisma        # User, RefreshToken, Role
    destination.prisma # Destination
    place.prisma       # Place, PlaceCategory
src/
  config/              # env.ts (validated), prisma.ts (client + adapter)
  middleware/          # auth, validate, error-handler
  modules/
    auth/              # route · controller · service · validation · md · api.md
    user/
    destination/
    place/
  utils/               # api-error, api-response, catch-async, geo, jwt,
                       # password, query-builder, request, slug, validation
  types/express.d.ts   # req.user
  app.ts               # middleware pipeline, /health, mounts /api
  routes.ts            # one line per module
  server.ts            # boot, DB ping, graceful shutdown
  seed.ts
docs/ARCHITECTURE.md   # envelope, error codes, layering, list queries
docs/POSTMAN.md        # environment, tokens, how to try any endpoint
```

## API overview

| Method | Endpoint                      | Access                                 |
| ------ | ----------------------------- | -------------------------------------- |
| GET    | `/health`                     | Public — liveness, no database         |
| GET    | `/health/ready`               | Public — readiness, pings the database |
| POST   | `/api/auth/register`          | Public                                 |
| POST   | `/api/auth/login`             | Public                                 |
| POST   | `/api/auth/refresh`           | Refresh token                          |
| POST   | `/api/auth/logout`            | Refresh token                          |
| GET    | `/api/auth/me`                | Authenticated                          |
| GET    | `/api/users`                  | ADMIN, MODERATOR                       |
| POST   | `/api/users`                  | ADMIN                                  |
| GET    | `/api/users/:id`              | ADMIN, MODERATOR                       |
| GET    | `/api/destinations`           | Public — list, search, filter          |
| GET    | `/api/destinations/nearby`    | Public — proximity search              |
| GET    | `/api/destinations/:idOrSlug` | Public — one destination               |
| POST   | `/api/destinations`           | ADMIN                                  |
| PATCH  | `/api/destinations/:id`       | ADMIN                                  |
| DELETE | `/api/destinations/:id`       | ADMIN                                  |
| PATCH  | `/api/users/:id`              | ADMIN                                  |

Full contracts, with Postman steps, live next to each module:
[`auth.api.md`](src/modules/auth/auth.api.md),
[`user.api.md`](src/modules/user/user.api.md),
[`destination.api.md`](src/modules/destination/destination.api.md),
[`place.api.md`](src/modules/place/place.api.md).
Start with [`docs/POSTMAN.md`](docs/POSTMAN.md).

## Design decisions

- **Modules, not layers-as-folders.** Everything about a feature — route,
  controller, service, validation, docs — sits in one directory. Adding a
  feature touches one folder plus one line in `routes.ts`.
- **Services never see Express.** They take plain arguments and return plain
  data, so they are callable from a job, a script or a test.
- **One envelope, always.** Even the rate limiter routes through the error
  handler, so no endpoint answers in a different shape.
- **Prisma 7 driver adapter.** The connection string lives in `prisma.config.ts`
  and `src/config/prisma.ts`, not in `schema.prisma`.
- **Transaction timeouts raised to 10s/20s.** Prisma 5s defaults assume a local
  database; a managed instance a region away spends that on round trips alone.
- **Refresh tokens hashed with SHA-256, not bcrypt.** They are already
  high-entropy; a slow hash would only add latency per refresh.
- **Allow-list query building.** Unknown query params are dropped rather than
  passed through, so a client cannot filter on a column you did not expose.
- **Liveness and readiness are separate.** `/health` never touches the database:
  a failing dependency should not make an orchestrator kill a healthy process.
  `/health/ready` is the one that pings Postgres.
- **No ESLint (yet).** `typescript-eslint` does not support TypeScript 7 —
  `strict` plus `noUnusedLocals`/`noUnusedParameters` covers most of it, and
  Prettier handles formatting. Add ESLint when the peer range catches up.

## Adding a module

```bash
cp -r src/modules/user src/modules/post   # then rename inside
```

Add the model to `prisma/schema/post.prisma`, mount it in `src/routes.ts`, run
`npm run prisma:migrate`. The full checklist is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#6-adding-a-module).

## Tests

```bash
npm test
```

The suite needs no database or network: it covers the query builder, JWT and
password helpers, and the middleware pipeline through supertest (`/health`,
unknown routes, validation errors, auth gates). Environment for tests is set in
`vitest.config.ts`, so a developer `.env` is never read.

## Scripts

| Script                    | Does                                              |
| ------------------------- | ------------------------------------------------- |
| `npm run dev`             | tsx watch, restarts on change                     |
| `npm run build`           | Type-check and emit to `dist/`                    |
| `npm start`               | Run the built server                              |
| `npm run typecheck`       | Types only, no emit — covers `src/` and `tests/`  |
| `npm test`                | Run the Vitest suite once                         |
| `npm run test:watch`      | Watch mode                                        |
| `npm run format`          | Prettier over the repo                            |
| `npm run prisma:generate` | Regenerate the client into `src/generated/prisma` |
| `npm run prisma:migrate`  | Create and apply a dev migration                  |
| `npm run prisma:deploy`   | Apply migrations (production)                     |
| `npm run prisma:studio`   | Browse the database                               |
| `npm run seed`            | Upsert the demo accounts                          |

## Deployment

```bash
docker build -t lumina-app .
docker run --rm -p 4000:4000 \
  -e DATABASE_URL=... -e JWT_ACCESS_SECRET=... -e JWT_REFRESH_SECRET=... \
  lumina-app
```

Run `npx prisma migrate deploy` against the target database as a release step.
The image builds in two stages and runs as the non-root `node` user.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — envelope, error codes,
  layering, list queries, how to add a module
- [`src/modules/auth/auth.md`](src/modules/auth/auth.md)
- [`src/modules/user/user.md`](src/modules/user/user.md)

## License

MIT
