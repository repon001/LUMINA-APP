# Expense Module

Planned money lives on the trip (`budgetTotal`); spent money lives here. The two
meet in the summary endpoint that drives the animated budget screen.

Endpoints and Postman steps: [expense.api.md](./expense.api.md).

## Files

| File                    | Role                                         |
| ----------------------- | -------------------------------------------- |
| `expense.route.ts`      | Nested paths under a trip, all authenticated |
| `expense.controller.ts` | Request → service, response envelope         |
| `expense.service.ts`    | CRUD plus the budget summary                 |
| `expense.validation.ts` | Zod schemas and inferred input types         |

---

## How the feature works

### Money is stored in the currency it was paid in

An expense keeps its own `currencyCode`. Nothing is converted on the way in,
because a rate applied at write time freezes a guess into a permanent record —
and it would be _today's_ rate for money spent on some other day.

The summary reports one currency as the trip's and lists the rest under
`otherCurrencies`, untouched. When a rates service arrives, conversion becomes a
presentation concern with the raw numbers still intact.

### Exact decimals, never floats

Amounts are `Decimal(12,2)` in Postgres and `Prisma.Decimal` in the summary, so
totals add up exactly. `0.1 + 0.2` is a bug people can see on a budget screen.

Validation normalises input to a fixed 2-decimal string before it reaches the
database, so `12.5` and `"12.50"` store identically.

### The summary is one read, not five queries

`GET …/expenses/summary` loads the trip's expenses once and derives everything in
memory: totals, per-category shares, per-day series, other currencies. A trip has
tens of expenses, not millions, so a single read beats four `groupBy` round trips
to a database a region away.

### The threshold rule is a pure function

```ts
budgetStatus(null); // NO_BUDGET
budgetStatus(0.79); // UNDER
budgetStatus(0.8); // NEAR
budgetStatus(1); // NEAR  - exactly on budget is not over it
budgetStatus(1.01); // OVER
```

Pure, exported and unit-tested, so the thresholds the UI animates against are
pinned by tests rather than by reading the service
([tests/expense.test.ts](../../../tests/expense.test.ts)).

### Expenses are private even when the trip is not

Every route checks **edit** access rather than view access. A published itinerary
is meant to be read by strangers; what it cost is not. That is why this module
uses `findEditableTrip` where the itinerary module uses `findViewableTrip`.

### `paidById` exists before splitting does

Every expense records who paid, even though there is one payer today. Shared
expenses need collaborators first; when they arrive, the data to split is already
there instead of needing a backfill.

## Edge cases

- A trip with no `budgetTotal` still gets a full summary — `status` is
  `NO_BUDGET` and `remaining` is `null`, so the screen shows spending without
  inventing a limit.
- A trip with no `currencyCode` borrows the most-used currency among its
  expenses, so a summary is still meaningful before the traveller sets one.
- Deleting a place empties `placeId` (`SetNull`) and leaves the expense intact —
  the money was still spent.
- `paidBy` is `onDelete: Restrict`: a user with recorded spending cannot be
  deleted out from under the trip's accounts.
- Categories with no spending are omitted from `byCategory` rather than sent as
  zeros, so the chart has no empty slices.
