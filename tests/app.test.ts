import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

/**
 * Covers the middleware pipeline and the shared envelope. Every route touched
 * here answers before any database call, so the suite needs no Postgres.
 */
const app = createApp();

describe("GET /health", () => {
  it("answers with the shared envelope", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toMatchObject({
      statusCode: 200,
      success: true,
      message: "Service healthy",
      data: { status: "ok" },
    });
  });

  it("returns a request id, and reuses a well-formed one from the caller", async () => {
    const generated = await request(app).get("/health");
    expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const traced = await request(app).get("/health").set("x-request-id", "trace-123");
    expect(traced.headers["x-request-id"]).toBe("trace-123");
  });

  it("replaces a caller id that does not look like an id", async () => {
    const response = await request(app).get("/health").set("x-request-id", "not an id");
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const tooLong = await request(app).get("/health").set("x-request-id", "a".repeat(200));
    expect(tooLong.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("unknown routes", () => {
  it("are a 404 in the error envelope, not an HTML page", async () => {
    const response = await request(app).get("/api/nope").expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      success: false,
      error: { code: "NOT_FOUND" },
    });
    expect(response.body.error.requestId).toBeTruthy();
  });
});

describe("validation", () => {
  it("reports every offending field at once as a 422", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email" })
      .expect(422);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toEqual([
      { field: "email", message: expect.any(String) },
      { field: "password", message: expect.any(String) },
    ]);
  });

  it("rejects a registration with a short password before touching the database", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada", email: "ada@example.com", password: "short" })
      .expect(422);

    expect(response.body.error.details).toContainEqual({
      field: "password",
      message: "Password must be at least 8 characters",
    });
  });
});

describe("auth gates", () => {
  it("refuses an unauthenticated request", async () => {
    const response = await request(app).get("/api/users").expect(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("refuses a malformed authorization header", async () => {
    await request(app).get("/api/users").set("authorization", "Basic abc").expect(401);
  });

  it("refuses a token this server did not sign", async () => {
    const response = await request(app)
      .get("/api/users")
      .set("authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.e30.bogus")
      .expect(401);

    expect(response.body.message).toMatch(/invalid or expired/);
  });
});
