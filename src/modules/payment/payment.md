# Payment Module

Taking money for a booking or a trip package, through Stripe or SSLCommerz.

Endpoints and Postman steps: [payment.api.md](./payment.api.md).

## Files

| File                      | Role                                        |
| ------------------------- | ------------------------------------------- |
| `payment.route.ts`        | Paths; callbacks deliberately have no token |
| `payment.controller.ts`   | Request → service, plus the dev stub page   |
| `payment.service.ts`      | Checkout, settlement, listing               |
| `payment.gateways.ts`     | Which gateway, and whether it is usable     |
| `payment.provider.ts`     | The interface every gateway implements      |
| `providers/stripe.ts`     | Checkout Sessions + signed webhooks         |
| `providers/sslcommerz.ts` | Hosted gateway + validated IPN              |
| `providers/stub.ts`       | Local gateway, no keys needed               |

---

## How the feature works

### One interface, three gateways

`PaymentGateway` is two methods: create a checkout, and interpret a callback.
Everything provider-specific — Stripe's minor units, SSLCommerz's validation
call — lives behind it, so the service reads the same for both:

```
POST /checkout ─→ service ─→ gatewayFor(provider).createCheckout() ─→ checkoutUrl
POST /webhook  ─→ service ─→ gatewayFor(provider).handleCallback()  ─→ outcome
```

Adding a third gateway is one file plus one line in the registry.

### A missing key is a 503, not a 500

`isConfigured` reports whether a gateway has credentials. Asking for one that
does not returns `503 SERVICE_UNAVAILABLE` with a plain message, and
`GET /api/payments/providers` lists only what works — so the app can hide a
button rather than show one that fails.

### Never trust the browser coming back

The customer returning to `PAYMENT_SUCCESS_URL` proves nothing: it is a URL they
can type. A payment only becomes `SUCCEEDED` when the gateway calls the webhook
server-to-server and that callback is proved authentic.

### Three things make a callback safe

1. **Authenticity.** Stripe signs the raw bytes: `t=…,v1=…`, HMAC-SHA256 with
   the endpoint secret, compared in constant time, rejected outside a five
   minute window so a captured callback cannot be replayed later. SSLCommerz
   does not sign at all — so its `val_id` is exchanged for a validation response
   fetched _from SSLCommerz_ with the store credentials. The POST is only a
   hint; the fetched answer is the fact.

2. **Idempotency.** Gateways retry, sometimes for days. A payment already in a
   final state is left untouched and reported as handled, so a retry cannot
   fulfil an order twice.

3. **Amount.** What the gateway says was charged is compared against what was
   asked for. A mismatch is recorded as `FAILED` with the numbers in
   `failureReason`, and nothing is fulfilled. This is the check that stops a
   tampered redirect turning a $500 tour into a $5 one.

### The raw body matters

Stripe signs the exact bytes it sent. Parsing to JSON and re-serialising
reorders keys and changes whitespace, and the signature no longer matches. So
`app.ts` mounts `express.raw()` on that one path, **before** the JSON parser:

```ts
app.use("/api/payments/webhook/stripe", express.raw({ type: "*/*", limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
```

The controller passes the buffer through as `rawBody` and the parsed body for
everyone else.

### Minor units are a real hazard

Stripe wants the smallest unit of the currency. $10.00 is `1000`, and ¥1000 is
also `1000` — the same integer meaning very different money, because the yen has
no minor unit. `toMinorUnits` knows the zero-decimal list; getting it wrong
charges a customer a hundred times over, which is why it is unit-tested rather
than inlined.

### The reference is ours, the providerRef is theirs

Every payment gets a `lum_…` reference before any gateway is called. It goes out
as Stripe's `client_reference_id` and SSLCommerz's `tran_id`, and comes back in
the callback — which is how a webhook finds its row. It is `UNIQUE`, so a
replayed callback can never touch two payments. `providerRef` stores their id
alongside, for looking a payment up in their dashboard.

### A failed checkout is kept, not deleted

If a gateway rejects the session, the row stays and is marked `FAILED` with the
reason. A customer who saw an error and a support agent looking for it should
find the same record.

### The stub gateway

Real gateways need keys and a publicly reachable callback url. The stub needs
neither: its "hosted page" is an endpoint on this API with a Pay and a Decline
button, and both post to the _same_ webhook the real gateways use. So the code
under test is the real path, minus the network.

It refuses to work in production — a gateway that approves its own payments is a
hole, not a convenience.

## Edge cases

- Webhooks answer `200` even for an unknown reference. A non-2xx means "retry"
  to a gateway, and a callback that can never match would retry for days.
- `REFUNDED` is a status the model carries but no endpoint sets yet; refunds are
  issued from the provider's dashboard today.
- Deleting a trip or a place leaves its payments intact (`SetNull`) — the money
  moved regardless of what happened to the plan afterwards.
- Payments are per-user: an admin can read any, another user gets `404`.
- SSLCommerz requires customer fields that a digital purchase has no use for;
  they are sent as `N/A` rather than inventing data.
