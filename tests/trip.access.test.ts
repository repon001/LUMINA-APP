import { describe, expect, it } from "vitest";
import { canEdit, canView, newShareCode } from "../src/modules/trip/trip.access";

const OWNER = { id: "user_owner", email: "owner@example.com", role: "USER" as const };
const STRANGER = { id: "user_other", email: "other@example.com", role: "USER" as const };
const ADMIN = { id: "user_admin", email: "admin@example.com", role: "ADMIN" as const };

const trip = (overrides: Partial<Parameters<typeof canView>[0]> = {}) => ({
  ownerId: OWNER.id,
  visibility: "PRIVATE" as const,
  shareCode: null,
  ...overrides,
});

describe("canView", () => {
  it("lets the owner and an admin read a private trip", () => {
    expect(canView(trip(), OWNER)).toBe(true);
    expect(canView(trip(), ADMIN)).toBe(true);
  });

  it("hides a private trip from everyone else", () => {
    expect(canView(trip(), STRANGER)).toBe(false);
    expect(canView(trip(), undefined)).toBe(false);
  });

  it("opens a public trip to anonymous visitors", () => {
    expect(canView(trip({ visibility: "PUBLIC" }), undefined)).toBe(true);
  });

  it("opens an unlisted trip only to the exact share code", () => {
    const unlisted = trip({ visibility: "UNLISTED", shareCode: "secret-code" });

    expect(canView(unlisted, undefined, "secret-code")).toBe(true);
    expect(canView(unlisted, undefined, "wrong-code")).toBe(false);
    expect(canView(unlisted, undefined)).toBe(false);
  });

  it("does not treat a missing code as a match for a trip with none", () => {
    const unlisted = trip({ visibility: "UNLISTED", shareCode: null });
    expect(canView(unlisted, undefined, undefined)).toBe(false);
  });

  it("does not let a code unlock a private trip", () => {
    const priv = trip({ visibility: "PRIVATE", shareCode: "leftover-code" });
    expect(canView(priv, undefined, "leftover-code")).toBe(false);
  });
});

describe("canEdit", () => {
  it("is owner or admin only", () => {
    expect(canEdit(trip(), OWNER)).toBe(true);
    expect(canEdit(trip(), ADMIN)).toBe(true);
    expect(canEdit(trip(), STRANGER)).toBe(false);
    expect(canEdit(trip(), undefined)).toBe(false);
  });

  it("stays closed even when the trip is public", () => {
    expect(canEdit(trip({ visibility: "PUBLIC" }), STRANGER)).toBe(false);
  });
});

describe("newShareCode", () => {
  it("is url-safe and unguessable", () => {
    const code = newShareCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newShareCode()).not.toBe(code);
  });
});
