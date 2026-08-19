# Expense & Budget API

What a trip actually cost, and how that compares to what was planned.

Postman setup: [docs/POSTMAN.md](../../../docs/POSTMAN.md). Design notes:
[expense.md](./expense.md).

Every route needs a token, and needs **edit** access to the trip — money stays
private even when the itinerary is public.

| Method | Path                                     | Purpose                     |
| ------ | ---------------------------------------- | --------------------------- |
| GET    | `/api/trips/:tripId/expenses`            | List, filter, page          |
| GET    | `/api/trips/:tripId/expenses/summary`    | Budget vs spend, breakdowns |
| POST   | `/api/trips/:tripId/expenses`            | Record spending             |
| PATCH  | `/api/trips/:tripId/expenses/:expenseId` | Correct an entry            |
| DELETE | `/api/trips/:tripId/expenses/:expenseId` | Remove an entry             |

Categories: `TRANSPORT`, `ACCOMMODATION`, `FOOD`, `ACTIVITIES`, `SHOPPING`,
`FEES`, `OTHER`.

---

## POST /api/trips/:tripId/expenses

```json
{
  "title": "Hotel, 5 nights",
  "amount": 1100,
  "currencyCode": "usd",
  "category": "ACCOMMODATION",
  "spentAt": "2026-10-04",
  "placeId": "cmt0c…",
  "notes": "Paid on arrival"
}
```

`201`. `amount` is normalised to `"1100.00"`, `currencyCode` to `"USD"`.
`spentAt` is the day the money went out (`YYYY-MM-DD`), not the moment it was
typed in. `paidBy` is the caller.

| Failure                               | Code                   |
| ------------------------------------- | ---------------------- |
| Negative amount, bad currency or date | `422 VALIDATION_ERROR` |
| Unknown `placeId`                     | `404 NOT_FOUND`        |
| Not your trip                         | `404 NOT_FOUND`        |

Zero is accepted — a free museum day is a real entry.

## GET /api/trips/:tripId/expenses

`{{baseUrl}}/api/trips/:tripId/expenses?category=FOOD&spentAt_gte=2026-10-06&sort=-amount`

| Query           | Meaning                                                           |
| --------------- | ----------------------------------------------------------------- |
| `q`             | Title or notes                                                    |
| `category`      | One of the categories above                                       |
| `currencyCode`  | e.g. `USD`                                                        |
| `spentAt`       | Exact day, or `spentAt_gte` / `spentAt_lte` ranges                |
| `paidById`      | Who paid                                                          |
| `sort`          | `spentAt`, `amount`, `category`, `createdAt` (default `-spentAt`) |
| `page`, `limit` | Defaults 1 and 20                                                 |

## GET /api/trips/:tripId/expenses/summary

Everything the budget screen needs, in one call.

```json
{
  "data": {
    "budgetTotal": "2400.00",
    "currencyCode": "USD",
    "spent": "2735.50",
    "remaining": "-335.50",
    "usedRatio": 1.14,
    "status": "OVER",
    "byCategory": [
      { "category": "TRANSPORT", "amount": "1520.00", "share": 0.556 },
      { "category": "ACCOMMODATION", "amount": "1100.00", "share": 0.402 },
      { "category": "FOOD", "amount": "100.50", "share": 0.037 }
    ],
    "byDay": [
      { "date": "2026-10-04", "amount": "1720.00" },
      { "date": "2026-10-05", "amount": "12.50" }
    ],
    "otherCurrencies": [{ "currencyCode": "JPY", "amount": "4500.00" }],
    "expenseCount": 7
  }
}
```

| Field             | Meaning                                                         |
| ----------------- | --------------------------------------------------------------- |
| `currencyCode`    | The trip's currency, or the most-used one if the trip has none  |
| `spent`           | Total **in that currency only**                                 |
| `usedRatio`       | `spent / budgetTotal`, 3 decimals; `null` with no budget        |
| `status`          | `UNDER` (< 80%), `NEAR` (80–100%), `OVER` (> 100%), `NO_BUDGET` |
| `byCategory`      | Non-zero categories, largest first, with each one's share       |
| `byDay`           | Daily totals in date order — the chart series                   |
| `otherCurrencies` | Totals in every other currency, deliberately unconverted        |

**Try it:** record spending in two currencies. The trip's currency drives
`spent`, `remaining` and `status`; the other appears untouched in
`otherCurrencies`, because converting here would freeze today's rate onto money
spent on another day.

## PATCH /api/trips/:tripId/expenses/:expenseId

Any subset of the create fields; `null` clears `placeId` or `notes`.

## DELETE /api/trips/:tripId/expenses/:expenseId

`200`, or `404` if it is not on this trip.
