# Moderation

## Why this exists

The catalogue only grows if somebody fills it. Before this, that somebody had to
be an admin: `POST /api/destinations` and `POST /api/places` were behind
`authorize(ADMIN)`, so every city and every restaurant was typed in by hand.

Now anyone signed in can propose one. That is the only way a guide of this kind
ever gets built — and it is also how one fills with rubbish, so nothing a
contributor sends is public until a moderator has looked at it.

## The rules, and where they live

All of them are in `moderation.access.ts`, deliberately in one file. They are a
security boundary, and a rule written twice is a rule that eventually gets
relaxed once.

| Rule                  | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `APPROVED_ONLY`       | The filter every public listing carries        |
| `canSeeUnapproved`    | Moderators and the submitter, nobody else      |
| `statusForSubmission` | Moderators skip the queue; everyone else waits |

## Three decisions worth knowing about

**The status is never a query parameter.** `APPROVED_ONLY` is spread _after_ the
caller's filters in the service, and `status` is absent from every `filterable`
config. A filter the caller can set is a filter the caller can unset, and
`?status=PENDING` would otherwise be a public window onto the queue.

**A stranger gets 404, not 403.** Telling someone they are not allowed to see a
thing confirms the thing exists. A pending submission simply does not exist yet,
to anyone but its author and a moderator.

**Deciding twice is refused.** Two moderators working the same queue would
otherwise overwrite each other's reasons, and the second one would never know.
The second decision gets a `409`.

## What is not here yet

Trust. Every submission needs a human, so with one moderator the queue backs up
and contributors wait days for a restaurant. The usual answer is to let someone
with a track record publish straight away — after N approved submissions, their
next one skips the queue. Worth adding when the queue starts hurting, not
before.
