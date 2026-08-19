# Payment API

Checkout through Stripe or SSLCommerz, with a local stub gateway so the whole
flow can be exercised without keys.

Postman setup: [docs/POSTMAN.md](../../../docs/POSTMAN.md). Design notes:
[payment.md](./payment.md).

| Method | Path                              | Auth     | Purpose                        |
| ------ | --------------------------------- | -------- | ------------------------------ |
| GET    | `/api/payments/providers`         | public   | Which gateways this server has |
| POST   | `/api/payments/checkout`          | any user | Start a payment                |
| GET    | `/api/payments`                   | any user | My payments                    |
| GET    | `/api/payments/:id`               | owner    | One payment                    |
| POST   | `/api/payments/webhook/:provider` | gateway  | Settlement callback            |
| GET    | `/api/payments/stub/checkout`     | dev only | Stand-in for a hosted page     |

Providers: `STRIPE`, `SSLCOMMERZ`, `STUB`. Purposes: `BOOKING`, `TRIP_PACKAGE`,
`SUBSCRIPTION`, `OTHER`. Statuses: `PENDING`, `SUCCEEDED`, `FAILED`,
`CANCELLED`, `REFUNDED`.

---

## GET /api/payments/providers

```json
{ "data": { "providers": ["STUB"] } }
```

Only gateways with credentials appear, so the app never shows a button that
cannot work. Asking for one that is missing returns `503`, not `500` — nothing
is broken, this deployment just has no keys for it.

## POST /api/payments/checkout

```json
{
  "provider": "STRIPE",
  "amount": 220,
  "currencyCode": "usd",
  "description": "Park Hyatt, 2 nights",
  "purpose": "BOOKING",
  "tripId": "cmt0b…",
  "placeId": "cmt0c…"
}
```

`201`

```json
{
  "data": {
    "id": "cmt1a…",
    "provider": "STRIPE",
    "status": "PENDING",
    "amount": "220.00",
    "currencyCode": "USD",
    "reference": "lum_233bd343b6fcf88d5b",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_…",
    "trip": { "id": "cmt0b…", "title": "Japan in autumn" },
    "place": { "slug": "park-hyatt-tokyo", "name": "Park Hyatt Tokyo" }
  }
}
```

Send the customer to `checkoutUrl`. The payment stays `PENDING` until the
gateway calls back — never trust the browser returning to your success page.

| Failure                                  | Code                      |
| ---------------------------------------- | ------------------------- |
| Amount ≤ 0, bad currency, no description | `422 VALIDATION_ERROR`    |
| Provider has no keys here                | `503 SERVICE_UNAVAILABLE` |
| `tripId` is not yours, unknown `placeId` | `404 NOT_FOUND`           |
| No token                                 | `401 UNAUTHORIZED`        |

## GET /api/payments

Your payments only. `?status=SUCCEEDED&provider=STRIPE&sort=-createdAt`.
Filter on `status`, `provider`, `tripId`, `createdAt`; `q` searches description
and reference.

## GET /api/payments/:id

Owner or admin. Anyone else gets `404`, not `403`.

## POST /api/payments/webhook/:provider

Called by the gateway, not by your app. There is no token — authenticity comes
from the provider instead:

- **Stripe** — `stripe-signature` header, HMAC-SHA256 over the raw body with
  `STRIPE_WEBHOOK_SECRET`. Missing header `400`, bad or stale signature `401`.
- **SSLCommerz** — the IPN is unsigned, so its `val_id` is exchanged for a
  validation response fetched from SSLCommerz with the store credentials. The
  POST itself is never believed.
- **STUB** — accepts a plain JSON body, development only.

Once authentic, the answer is always `200`:

```json
{ "data": { "handled": true, "reference": "lum_233b…", "status": "SUCCEEDED" } }
```

| Situation              | `data`                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| First success          | `{ handled: true, status: "SUCCEEDED" }`                            |
| Same callback retried  | `{ handled: true, status: "SUCCEEDED", reason: "already settled" }` |
| Unknown reference      | `{ handled: false, reason: "unknown reference" }`                   |
| Amount does not match  | `{ handled: true, status: "FAILED", reason: "amount mismatch" }`    |
| Event we do not act on | `{ handled: true, reason: "event ignored" }`                        |

A non-2xx tells a gateway to retry, so an unmatched callback is acknowledged
rather than rejected — otherwise it retries for days.

### Testing Stripe locally

```bash
stripe listen --forward-to localhost:4000/api/payments/webhook/stripe
# copy the whsec_… it prints into STRIPE_WEBHOOK_SECRET, then:
stripe trigger checkout.session.completed
```

### Testing SSLCommerz locally

Their sandbox must reach your machine, so expose it first:

```bash
cloudflared tunnel --url http://localhost:4000    # or ngrok http 4000
# put the public https url in PUBLIC_BASE_URL, restart, then start a checkout
```

## Trying the whole flow with no keys at all

With `PAYMENT_ALLOW_STUB=true` (default outside production):

1. `POST /api/payments/checkout` with `"provider": "STUB"`.
2. Open the returned `checkoutUrl` in a browser — a page with **Pay** and
   **Decline**.
3. Either button posts to the same webhook a real gateway would call.
4. `GET /api/payments/:id` shows `SUCCEEDED` or `FAILED`.

**Try it:** post that callback twice. The second returns
`reason: "already settled"` and nothing changes — which is exactly what a
gateway retry must do.
