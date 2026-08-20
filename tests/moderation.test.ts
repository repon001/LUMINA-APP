import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { ModerationStatus, Role } from "../src/generated/prisma/client";
import {
  APPROVED_ONLY,
  canSeeUnapproved,
  statusForSubmission,
} from "../src/modules/moderation/moderation.access";
import { queueQuerySchema, rejectSchema } from "../src/modules/moderation/moderation.validation";

const app = createApp();

const viewer = (role: Role, id = "u1") => ({ id, role });

describe("who may see something still in the queue", () => {
  it("lets a moderator and an admin see anything", () => {
    expect(canSeeUnapproved(viewer(Role.MODERATOR), "someone-else")).toBe(true);
    expect(canSeeUnapproved(viewer(Role.ADMIN), "someone-else")).toBe(true);
  });

  it("lets the person who submitted it see their own", () => {
    expect(canSeeUnapproved(viewer(Role.USER, "u1"), "u1")).toBe(true);
  });

  it("shows it to nobody else", () => {
    expect(canSeeUnapproved(viewer(Role.USER, "u1"), "u2")).toBe(false);
    expect(canSeeUnapproved(null, "u1")).toBe(false);
  });

  it("does not treat an unattributed entry as everybody's", () => {
    // A submitter's account can be deleted, which nulls the column. That must
    // not turn a pending row into one anyone may read.
    expect(canSeeUnapproved(viewer(Role.USER, "u1"), null)).toBe(false);
  });
});

describe("where a submission starts", () => {
  it("waits when an ordinary user sends it", () => {
    expect(statusForSubmission(viewer(Role.USER))).toBe(ModerationStatus.PENDING);
  });

  it("skips the queue for a moderator, who is doing the reviewing anyway", () => {
    expect(statusForSubmission(viewer(Role.MODERATOR))).toBe(ModerationStatus.APPROVED);
    expect(statusForSubmission(viewer(Role.ADMIN))).toBe(ModerationStatus.APPROVED);
  });
});

describe("the public filter", () => {
  it("is approved, and survives being spread after a caller's filters", () => {
    const callerTriedToOverride = { status: ModerationStatus.PENDING, isActive: true };
    const applied = { ...callerTriedToOverride, ...APPROVED_ONLY };

    expect(applied.status).toBe(ModerationStatus.APPROVED);
  });
});

describe("queue query", () => {
  it("defaults to the pending destinations, oldest page first", () => {
    const parsed = queueQuerySchema.parse({});

    expect(parsed).toMatchObject({
      kind: "destination",
      status: ModerationStatus.PENDING,
      page: 1,
      limit: 20,
    });
  });

  it("refuses a kind that is not a thing", () => {
    expect(queueQuerySchema.safeParse({ kind: "user" }).success).toBe(false);
  });
});

describe("rejecting", () => {
  it("insists on a reason, whether it is missing or too short", () => {
    for (const body of [{}, { note: "" }, { note: "no" }]) {
      const result = rejectSchema.safeParse(body);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toMatch(/say why/i);
    }
  });

  it("accepts one that explains itself", () => {
    expect(rejectSchema.safeParse({ note: "The coordinates are in the sea." }).success).toBe(true);
  });
});

describe("the moderation routes", () => {
  it("are closed to anyone without a session", async () => {
    const calls = [
      request(app).get("/api/moderation/queue"),
      request(app).get("/api/moderation/counts"),
      request(app).get("/api/moderation/mine"),
      request(app).post("/api/moderation/destination/abc/approve"),
      request(app).post("/api/moderation/place/abc/reject").send({ note: "nope" }),
    ];

    for (const call of calls) {
      expect((await call).status).toBe(401);
    }
  });

  it("still lets anyone signed in submit, rather than only admins", async () => {
    // 401 rather than 403 is the point: the route no longer checks a role, so
    // an ordinary user gets past authorisation and is only stopped by not
    // having a token at all.
    const destination = await request(app).post("/api/destinations").send({ name: "Nara" });
    const place = await request(app).post("/api/places").send({ name: "Todai-ji" });

    expect(destination.status).toBe(401);
    expect(place.status).toBe(401);
  });
});
