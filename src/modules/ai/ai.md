# AI Module

The planner behind "I have 5 days in Tokyo, $1000, and I like food and
photography" turning into a real itinerary.

Endpoints and Postman steps: [ai.api.md](./ai.api.md).

## Files

| File               | Role                                              |
| ------------------ | ------------------------------------------------- |
| `ai.route.ts`      | Paths, auth, per-user rate limit                  |
| `ai.controller.ts` | Request → service, and cost reporting in `meta`   |
| `ai.service.ts`    | Prompts, and writing an accepted plan into a trip |
| `ai.provider.ts`   | The OpenRouter call, and getting JSON back safely |
| `ai.schemas.ts`    | The shapes the model must answer in               |
| `ai.validation.ts` | The shapes a client may ask in                    |

---

## How the feature works

### One schema, two jobs

Each answer shape is a Zod schema. It is converted to JSON Schema and sent as
OpenRouter's `response_format`, so the model is _constrained_ rather than merely
asked; and the same schema validates the reply.

```
        ai.schemas.ts
        ┌──────────────┐
        │ Zod schema   │
        └──┬────────┬──┘
   toJSONSchema      safeParse
           │            │
     response_format   reply
```

The contract cannot drift between the prompt and the parser, because there is
only one definition. A model that ignores the constraint fails validation here
instead of writing a malformed object into somebody's itinerary.

### The generated shape matches what the itinerary stores

`generatedItemSchema` uses the same `kind` values and the same `HH:MM` wall-clock
times as `ItineraryItem`. That is deliberate: it is what lets `applyToTripId`
write a plan straight into a trip with no translation layer, and it means a
malformed time is caught by the AI schema _and_ by the itinerary's own rules.

### Applying a plan replaces, and does it in one statement

`applyPlanToTrip` deletes the trip's days and writes the new ones as a single
batched transaction.

Two decisions worth knowing:

- **Replace, not merge.** The traveller asked for a plan for this trip.
  Interleaving a generated day 3 with an existing day 3 produces something
  nobody asked for.
- **Batched, not interactive.** Generation takes a minute or more. An
  interactive transaction opened after that wait has to acquire a pooled
  connection that may have gone stale — which is exactly how the first version
  failed, with `Unable to start a transaction in the given time`. The array form
  is one round trip and holds nothing open while the model is thinking.

Generated items keep the suggested place name as their title and are **not**
linked to catalogue `Place` rows. Matching free text to a place is a separate
problem, and a wrong match is worse than no link.

### Reasoning is off by default

`OPENROUTER_REASONING` defaults to `off`.

Reasoning tokens come out of the same `max_tokens` as the answer. A model that
thinks until the budget runs out returns an empty string — measured on a free
model here: 91 seconds and nothing, versus 14 seconds and a complete plan with
reasoning disabled. A shallower plan beats no plan.

Turn it up when the model and the budget can afford it.

### Failures are told apart

An unusable answer has several causes, and they need different fixes, so the
provider distinguishes them:

| Symptom                                   | Reported as                                             |
| ----------------------------------------- | ------------------------------------------------------- |
| No API key                                | `503` "AI features are not configured"                  |
| Timeout or network failure                | `503` "provider is unreachable" / "took too long"       |
| Provider 4xx (bad request, out of credit) | `400` with the provider's own message                   |
| Provider 5xx or 429                       | `503` "provider is unavailable"                         |
| `finish_reason: length`                   | `503` "answer was cut off" — raise `max_tokens`         |
| Empty answer, reasoning present           | `503` "spent its whole budget reasoning"                |
| Text that is not JSON                     | `503` "malformed JSON", head logged server-side         |
| JSON that breaks the schema               | `503` "did not match the expected shape", issues logged |

The client sees a short reason; the server log carries the detail. An operator
should be able to tell "the model is wrong" from "the model is broke" from "the
model is thinking too much" without reproducing it.

### The JSON is extracted defensively

`response_format` is honoured strictly by good models and treated as a
suggestion by some others, which wrap the object in a ` ```json ` fence or
write a sentence first. Rather than restrict the app to well-behaved models, the
parser tries the raw text, then a fenced block, then the widest brace-delimited
span.

### Rate limited per user, not per IP

Every call here spends money at the provider. The limiter keys on the
authenticated user id, so a shared office network does not share one quota and a
single account cannot run up a bill from many devices.

### Cost is reported on every response

`meta.usage.costUsd` is what OpenRouter charged for that call, alongside the
model that answered. The client ignores it; whoever watches the bill does not.
It is the cheapest observability a paid feature can have.

### The assistant is stateless

The client sends the last few turns. The server stores no chat history, because
it has no other use for it — and a conversation the server keeps is a
conversation it has to secure, migrate and delete on request.

When a `tripId` is given, the trip's route, dates and budget are added as
context, which is why it must be a trip the caller owns.

## Edge cases

- A plan is generated _before_ it is applied, so a provider failure never
  destroys an existing itinerary — the delete and the write happen together,
  after a valid answer.
- `applyToTripId` is checked for ownership **before** the paid request, so a
  request that could never be stored is never paid for.
- The model is asked never to invent a venue, and to say so when a budget is
  unrealistic rather than quietly planning something unaffordable.
- Free models on OpenRouter are rate-limited upstream and answer inconsistently;
  they are fine for development, and `OPENROUTER_MODEL` is one line to change.
