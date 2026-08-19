# AI API

Trip planning, recommendations, packing lists and a travel assistant, served
through OpenRouter.

Postman setup: [docs/POSTMAN.md](../../../docs/POSTMAN.md). Design notes:
[ai.md](./ai.md).

| Method | Path                      | Auth     | Purpose                                      |
| ------ | ------------------------- | -------- | -------------------------------------------- |
| GET    | `/api/ai/status`          | public   | Is AI configured, and which model            |
| POST   | `/api/ai/trip-plan`       | any user | Generate (and optionally apply) an itinerary |
| POST   | `/api/ai/recommendations` | any user | Places to consider                           |
| POST   | `/api/ai/packing-list`    | any user | What to bring                                |
| POST   | `/api/ai/assistant`       | any user | Conversational travel help                   |

Every generating route is rate limited **per user** (`AI_RATE_REQUEST_LIMIT`,
default 20 per window) because each call costs money at the provider.

Every response carries `meta.model` and `meta.usage` — prompt tokens, completion
tokens, and what OpenRouter charged in USD.

---

## GET /api/ai/status

```json
{ "data": { "available": true, "model": "anthropic/claude-opus-5" } }
```

`available: false` when the server has no `OPENROUTER_API_KEY` — the app should
hide its AI screens rather than offer a button that returns `503`.

## POST /api/ai/trip-plan

```json
{
  "destination": "Kyoto, Japan",
  "days": 3,
  "budget": 600,
  "currencyCode": "USD",
  "interests": "temples, photography, street food",
  "pace": "balanced",
  "travellers": 2,
  "applyToTripId": "cmt0e…"
}
```

`200`

```json
{
  "message": "Itinerary generated and applied",
  "data": {
    "tripTitle": "Kyoto 3-Day Cultural & Culinary Journey",
    "overview": "This balanced itinerary focuses on Kyoto's most photogenic temples…",
    "currencyCode": "USD",
    "estimatedTotal": 600,
    "days": [
      {
        "dayNumber": 1,
        "title": "Eastern Temples & Gion Streets",
        "summary": "Higashiyama on foot.",
        "items": [
          {
            "title": "Morning temple",
            "kind": "PLACE",
            "startTime": "08:30",
            "endTime": "10:30",
            "placeName": "Kiyomizu-dera",
            "notes": "Go early to beat the crowds.",
            "estimatedCost": 2.7
          }
        ]
      }
    ],
    "tips": ["Buy a 1-day bus pass if you are hopping between temples."]
  },
  "meta": {
    "model": "anthropic/claude-opus-5",
    "usage": { "promptTokens": 223, "completionTokens": 3298, "costUsd": 0.0412 },
    "appliedTo": "cmt0e…"
  }
}
```

`pace` is `relaxed`, `balanced` or `packed`. `days` is 1–30.

**`applyToTripId` writes the plan into that trip** as real days and cards, then
`GET /api/trips/:id/days` returns it like any hand-built itinerary. It
**replaces** whatever itinerary the trip had. Omit it to preview the plan and
let the traveller accept it later.

| Failure                                                       | Code                      |
| ------------------------------------------------------------- | ------------------------- |
| No destination, `days` outside 1–30                           | `422 VALIDATION_ERROR`    |
| `applyToTripId` is not your trip                              | `404 NOT_FOUND`           |
| No `OPENROUTER_API_KEY`                                       | `503 SERVICE_UNAVAILABLE` |
| Provider down, timed out, or answered with something unusable | `503 SERVICE_UNAVAILABLE` |
| Over your AI quota                                            | `429 RATE_LIMITED`        |

## POST /api/ai/recommendations

```json
{ "destination": "Kyoto", "interests": "photography at dawn", "category": "ATTRACTION", "limit": 4 }
```

```json
{
  "data": {
    "recommendations": [
      {
        "name": "Fushimi Inari-taisha",
        "category": "ATTRACTION",
        "why": "Thousands of vermilion torii gates, empty at dawn.",
        "bestTime": "05:30 - 07:00",
        "estimatedCost": 0
      }
    ]
  }
}
```

`limit` defaults to 8, caps at 20. `category` is optional and uses the same set
as the place catalogue.

## POST /api/ai/packing-list

```json
{
  "destination": "Kyoto",
  "days": 3,
  "season": "April",
  "activities": "temple walking, photography"
}
```

Returns `summary` plus `groups`, each with items carrying `quantity`,
`essential` and `why`.

## POST /api/ai/assistant

```json
{
  "message": "Is three days enough, and what should I cut if it rains?",
  "tripId": "cmt0e…",
  "history": [
    { "role": "user", "content": "I am going to Kyoto." },
    { "role": "assistant", "content": "Great choice - April is cherry blossom season." }
  ]
}
```

```json
{
  "data": {
    "reply": "Three days is enough to feel Kyoto's spring charm…",
    "suggestions": [
      "Day-by-day sunny itinerary",
      "Rainy-day backup plan",
      "Budget breakdown",
      "Best cherry-blossom routes"
    ]
  }
}
```

The server keeps no chat history: send the last few turns in `history` (max 20).
When `tripId` is given, the trip's route, dates and budget are added as context —
which is why it must be a trip you own.

`suggestions` are short follow-ups meant to be rendered as tappable chips.

## Choosing a model

`OPENROUTER_MODEL` takes any id OpenRouter serves — `anthropic/claude-opus-5`,
`anthropic/claude-haiku-4.5`, `google/gemini-2.5-flash`, or a `:free` model.
Requirements: it must support **structured outputs**, which you can check on
OpenRouter's model list (`supported_parameters` contains `structured_outputs`).

`OPENROUTER_REASONING` (`off` by default) controls how much of the token budget
a reasoning model may spend thinking. Leave it off unless plan quality visibly
needs it — see [ai.md](./ai.md#reasoning-is-off-by-default).
