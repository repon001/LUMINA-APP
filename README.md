# LUMINA — Backend

Backend for a travel app that treats a journey as one continuous thing: a route
across cities, a plan for each day, what it costs, and what you paid.

Express 5, Prisma 7, PostgreSQL, TypeScript. Every feature is one module — route,
controller, service, validation, and its own docs — over shared infrastructure.

![Node](https://img.shields.io/badge/Node-24-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.2-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.9-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Contents

- [Why this exists](#why-this-exists)
- [The problems it solves](#the-problems-it-solves)
- [What it does](#what-it-does)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [Design decisions](#design-decisions)
- [Tests](#tests)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Known gaps](#known-gaps)
- [License](#license)

---

## Why this exists

Planning a trip is not one task. It is a route, a schedule, a budget, a pile of
bookings, and a running argument with yourself about whether three days is enough
for Kyoto. Most people run it across four tools that do not know about each
other: a maps app for the route, a notes app for the plan, a spreadsheet for the
money, and a mailbox full of confirmations.

The moment anything changes — a flight moves, a day gets cut, a temple is closed —
none of those tools update the others. The plan drifts from reality, and the
traveller becomes the integration layer.

LUMINA's front end is built around the opposite idea: a map you fly across, days
you swipe between, a budget ring that animates as you spend. **None of that works
unless one system holds the whole journey.** A screen that animates Tokyo → Kyoto
needs an ordered route, not two rows in unrelated tables. A day you drag a card
onto needs positions that stay contiguous. A budget ring needs exact money, not
floats.

That is what this backend is: the single model of a journey that everything else
animates.

## The problems it solves

| The problem                                                                                                        | How this API answers it                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A route is an order, not a set.** Dhaka → Tokyo → Kyoto is a different trip from Kyoto → Tokyo → Dhaka.          | Stops and itinerary cards carry a `position`, unique per parent, renumbered in one transaction on every insert, move and delete. Positions are always contiguous, never holed.                                              |
| **Plans get edited by dragging.** A card moves to another day; a day moves to the front.                           | Dedicated reorder and move endpoints rewrite both affected lists atomically, instead of making the client patch positions one by one and hope.                                                                              |
| **Days are days, not timestamps.** A phone in Dhaka and a server in UTC must agree which day you fly.              | Trip and stop dates are `DATE`, taken as `YYYY-MM-DD`. Itinerary times are wall-clock strings (`09:30`) — a plan says "09:30 local", and an instant drifts the moment the trip crosses a timezone.                          |
| **"Near me" cannot scan the planet.** Distance is trigonometry, and no index answers it.                           | Proximity search runs an indexed bounding-box scan first, then measures exact distance on the survivors. One index, no PostGIS, correct at the poles and the antimeridian.                                                  |
| **Money is not a float.** A budget ring showing `$719.99999` is a bug people can see.                              | `Decimal` in Postgres, `Prisma.Decimal` in totals, fixed 2-decimal strings on the wire.                                                                                                                                     |
| **Spending happens in several currencies.** Converting on the way in freezes today's rate onto last week's dinner. | Expenses keep the currency they were paid in. The summary totals the trip's currency and lists the rest untouched.                                                                                                          |
| **A shared itinerary should be copyable, not editable.** That is the point of publishing one.                      | Three visibilities and a rotatable share code. Anyone who can see a trip can duplicate it into their own account; only the owner can change the original.                                                                   |
| **A private trip must not be discoverable by probing ids.**                                                        | A trip you may not see returns `404`, never `403` — a `403` confirms the id exists.                                                                                                                                         |
| **Payments are only real when the gateway says so**, and gateways retry for days.                                  | Stripe (signed webhooks) and SSLCommerz (unsigned IPN, re-validated against their API) behind one interface. Settlement is idempotent, and the charged amount is compared with what was asked before anything is fulfilled. |
| **An AI plan is worthless if it cannot be stored.**                                                                | The model answers in a schema that mirrors the itinerary tables, so an accepted plan is written straight into a trip as real days and cards.                                                                                |
| **A model that thinks too long returns nothing.**                                                                  | Reasoning budget is a setting; failures are told apart (cut off vs. malformed vs. out of credit); every answer reports what it cost.                                                                                        |
| **A deployment without keys should degrade, not crash.**                                                           | Payment and AI providers advertise whether they are configured. Missing keys are a `503` with a plain message, and `/providers` and `/ai/status` let the app hide dead buttons.                                             |

## What it does

| Capability                | Summary                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**                  | Register, login, `/me`, logout. Access token plus rotating refresh token, replay detection, revocation that takes effect immediately. |
| **Destinations & places** | Curated catalogue with tags, ratings and proximity search over an indexed bounding box.                                               |
| **Trips**                 | Ordered multi-destination routes, calendar-day dates, budgets, share links, duplication of public itineraries.                        |
| **Itineraries**           | Day-by-day cards with wall-clock times, drag-and-drop between days, gap-free ordering.                                                |
| **Budgets**               | Expenses in the currency they were paid in, exact decimal totals, per-category and per-day breakdowns, over-budget status.            |
| **Payments**              | Stripe and SSLCommerz behind one interface, plus a local stub gateway so the flow works with no keys.                                 |
| **AI**                    | Trip planner that writes into a real itinerary, recommendations, packing lists, and a trip-aware assistant.                           |
| **Platform**              | One response envelope, request ids, validated env, allow-list query building, health and readiness probes.                            |

## Getting started

### Prerequisites

- Node.js ≥ 20 (24 recommended)
- PostgreSQL 14+

### Install

```bash
npm install
cp .env.example .env      # edit DATABASE_URL and the two JWT secrets
npm run prisma:generate
npm run prisma:deploy     # apply migrations
npm run seed              # admin@ / moderator@ / user@example.com - Password123!
npm run dev
```

The API listens on `http://localhost:4000`:

```bash
curl http://localhost:4000/health
```

Then open [`docs/POSTMAN.md`](docs/POSTMAN.md) — it sets up an environment that
keeps your token fresh, which every module's `*.api.md` assumes.

### Environment

Every variable is validated in [`src/config/env.ts`](src/config/env.ts); the app
refuses to boot on a bad one, or with the example secrets in production.

| Variable                                            | Default                   | Notes                                            |
| --------------------------------------------------- | ------------------------- | ------------------------------------------------ |
| `NODE_ENV` / `PORT`                                 | `development` / `4000`    |                                                  |
| `CORS_ORIGINS`                                      | `http://localhost:3000`   | Comma-separated allow-list                       |
| `DATABASE_URL`                                      | —                         | Required                                         |
| `DATABASE_SCHEMA`                                   | `public`                  | Set it when sharing a database with another app  |
| `DIRECT_URL`                                        | —                         | Only when `DATABASE_URL` is pooled               |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`          | —                         | Required, at least 16 chars, must differ         |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL`            | `15m` / `30d`             |                                                  |
| `COOKIE_SECURE`                                     | `false`                   | `true` behind HTTPS                              |
| `RATE_TIME_LIMIT` / `RATE_REQUEST_LIMIT`            | `15` / `100`              | Window in minutes, requests per IP               |
| `AUTH_RATE_REQUEST_LIMIT`                           | `10`                      | Failed auth attempts per window                  |
| `AI_RATE_REQUEST_LIMIT`                             | `20`                      | AI calls per window per user                     |
| `PUBLIC_BASE_URL`                                   | `http://localhost:4000`   | Where gateways call back                         |
| `PAYMENT_SUCCESS_URL` / `PAYMENT_CANCEL_URL`        | localhost:3000            | App deep links after checkout                    |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`       | —                         | Enables Stripe                                   |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` | —                         | Enables SSLCommerz                               |
| `SSLCOMMERZ_SANDBOX`                                | `true`                    | Sandbox vs live host                             |
| `PAYMENT_ALLOW_STUB`                                | `true`                    | Local gateway; refused in production             |
| `OPENROUTER_API_KEY`                                | —                         | Enables the AI features                          |
| `OPENROUTER_MODEL`                                  | `anthropic/claude-opus-5` | Any OpenRouter id with structured-output support |
| `OPENROUTER_REASONING`                              | `off`                     | `off` / `low` / `medium` / `high`                |
| `OPENROUTER_TIMEOUT_MS`                             | `90000`                   | Plans take longer than a normal request          |

## Project structure

```
prisma/schema/           # split per domain: user, destination, place, trip,
                         # itinerary, expense, payment
src/
  config/                # env.ts (validated), prisma.ts (client + adapter)
  middleware/            # auth, validate, rate-limit, request-id, error-handler
  modules/               # one folder per feature, each with
    auth/ user/          #   route - controller - service - validation
    destination/ place/  #   <name>.md      how the feature works
    trip/ itinerary/     #   <name>.api.md  endpoints + Postman steps
    expense/ payment/    # payment/providers: stripe, sslcommerz, stub
    ai/                  # ai/: provider (OpenRouter) + schemas
  utils/                 # api-error, api-response, catch-async, geo, jwt,
                         # ordering, password, query-builder, request, slug
  app.ts                 # middleware pipeline, health probes, mounts /api
  routes.ts              # one line per module
  server.ts              # boot, DB ping, graceful shutdown
docs/ARCHITECTURE.md     # envelope, error codes, layering, list queries
docs/POSTMAN.md          # environment, tokens, how to try any endpoint
tests/                   # unit + pipeline tests, no database required
```

## API overview

| Method            | Endpoint                                                                          | Access                       |
| ----------------- | --------------------------------------------------------------------------------- | ---------------------------- |
| GET               | `/health` and `/health/ready`                                                     | Public — liveness, readiness |
| POST              | `/api/auth/register`, `login`, `refresh`, `logout`                                | Public                       |
| GET               | `/api/auth/me`                                                                    | Authenticated                |
| GET/POST/PATCH    | `/api/users`, `/api/users/:id`                                                    | ADMIN, MODERATOR             |
| GET               | `/api/destinations`, `/nearby`, `/:idOrSlug`                                      | Public                       |
| GET               | `/api/places`, `/nearby`, `/:id`                                                  | Public                       |
| POST/PATCH/DELETE | `/api/destinations`, `/api/places`                                                | ADMIN                        |
| GET/POST          | `/api/trips`, `/api/trips/public`, `/api/trips/shared/:code`                      | Mine / public / shared link  |
| POST              | `/api/trips/:id/duplicate`, `/share`, `/stops`, `/stops/order`                    | Any viewer / owner           |
| GET/POST/PATCH    | `/api/trips/:tripId/days` and `/items` (including `/move`)                        | Owner (read: any viewer)     |
| GET/POST          | `/api/trips/:tripId/expenses`, `/summary`                                         | Owner                        |
| GET/POST          | `/api/payments`, `/checkout`, `/providers`                                        | Any user / public            |
| POST              | `/api/payments/webhook/:provider`                                                 | Gateway                      |
| GET/POST          | `/api/ai/status`, `/trip-plan`, `/recommendations`, `/packing-list`, `/assistant` | Public / any user            |

Full contracts, with Postman steps, live next to each module:
[auth](src/modules/auth/auth.api.md),
[user](src/modules/user/user.api.md),
[destination](src/modules/destination/destination.api.md),
[place](src/modules/place/place.api.md),
[trip](src/modules/trip/trip.api.md),
[itinerary](src/modules/itinerary/itinerary.api.md),
[expense](src/modules/expense/expense.api.md),
[payment](src/modules/payment/payment.api.md),
[ai](src/modules/ai/ai.api.md).

## Design decisions

- **Modules, not layers-as-folders.** Everything about a feature sits in one
  directory. Adding one touches one folder plus one line in `routes.ts`.
- **Services never see Express.** They take plain arguments and return plain
  data, so they are callable from a job, a script or a test.
- **One envelope, always.** Even the rate limiter routes through the error
  handler, so no endpoint answers in a different shape.
- **Authorisation lives in one file per aggregate.** Every trip endpoint funnels
  through two pure predicates in `trip.access.ts`, unit-tested directly rather
  than through HTTP.
- **Allow-list query building.** Unknown query params are dropped rather than
  passed through, so a client cannot filter on a column you did not expose.
- **Ordering is a shared helper.** Three ordered collections use the same
  two-pass renumber, because `(parent, position)` uniqueness makes in-place
  shuffling impossible.
- **Integrations are adapters.** Payment gateways and the AI provider sit behind
  small interfaces with a configured / not-configured flag, so a deployment
  without keys degrades instead of failing.
- **No ESLint yet.** `typescript-eslint` does not support TypeScript 7 —
  `strict` plus `noUnusedLocals` / `noUnusedParameters` covers most of it, and
  Prettier handles formatting. Add it when the peer range catches up.

Adding a module: copy the closest one, add its schema file, mount it in
`src/routes.ts`, run `npm run prisma:migrate`. The checklist is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tests

```bash
npm test
```

160 tests, no database or network required: the query builder, geo maths, slugs,
ordering, JWT and password helpers, trip access rules, every module's validation,
Stripe signature verification and minor-unit conversion, plus the middleware
pipeline through supertest.

## Scripts

| Script                   | Does                                        |
| ------------------------ | ------------------------------------------- |
| `npm run dev`            | tsx watch, restarts on change               |
| `npm run build`          | `prisma generate`, then type-check and emit |
| `npm start`              | Run the built server                        |
| `npm run typecheck`      | Types only — covers `src/` and `tests/`     |
| `npm test`               | Vitest once                                 |
| `npm run test:watch`     | Watch mode                                  |
| `npm run format`         | Prettier over the repo                      |
| `npm run prisma:migrate` | Create and apply a dev migration            |
| `npm run prisma:deploy`  | Apply migrations (production)               |
| `npm run prisma:studio`  | Browse the database                         |
| `npm run seed`           | Upsert the demo accounts                    |

## Deployment

```bash
docker build -t lumina-app .
docker run --rm -p 4000:4000 \
  -e DATABASE_URL=... -e JWT_ACCESS_SECRET=... -e JWT_REFRESH_SECRET=... \
  lumina-app
```

Run `npx prisma migrate deploy` against the target database as a release step.
The image builds in two stages and runs as the non-root `node` user. CI runs
format, typecheck, tests and build on every push.

## Known gaps

Deliberately not built yet, in rough priority order: reviews and saved places,
trip collaboration (the schema already records who paid an expense), social
follow / like / comment, notifications, media upload, weather and maps
integrations, admin moderation tooling, and refunds — `REFUNDED` exists as a
status, but refunds are issued from the provider dashboard today.

## License

MIT
