import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { updateProfileSchema } from "../src/modules/user/user.validation";

const app = createApp();

describe("updateProfileSchema", () => {
  it("accepts the things a user owns about themselves", () => {
    const parsed = updateProfileSchema.parse({
      name: "  Ada Lovelace  ",
      email: "ada@example.com",
    });

    expect(parsed.name).toBe("Ada Lovelace");
    expect(parsed.email).toBe("ada@example.com");
  });

  it("will not let anyone promote themselves", () => {
    // The admin schema takes `role`; this one must not, or an authenticated
    // user could grant themselves ADMIN with a single request.
    const parsed = updateProfileSchema.parse({
      name: "Ada",
      role: "ADMIN",
      isActive: false,
    } as never);

    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("isActive");
  });

  it("demands the current password before setting a new one", () => {
    const result = updateProfileSchema.safeParse({ password: "new-password-123" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/current password/i);
  });

  it("allows a password change that proves who is asking", () => {
    const result = updateProfileSchema.safeParse({
      password: "new-password-123",
      currentPassword: "the-old-one",
    });

    expect(result.success).toBe(true);
  });

  it("refuses a request that changes nothing", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it("still checks the ordinary rules", () => {
    expect(updateProfileSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ password: "short", currentPassword: "x" }).success).toBe(
      false,
    );
  });
});

describe("the profile routes", () => {
  it("needs a session, and does not read 'me' as a user id", async () => {
    // If "/me" were declared after "/:id" it would match the admin-only route
    // instead, and answer 403 for a request the user is entitled to make.
    for (const call of [
      request(app).patch("/api/users/me").send({ name: "Ada" }),
      request(app).post("/api/users/me/avatar"),
      request(app).delete("/api/users/me/avatar"),
    ]) {
      const response = await call;
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ success: false });
    }
  });
});
