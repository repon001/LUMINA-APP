import { describe, expect, it } from "vitest";
import { isApiError } from "../src/utils/api-error";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../src/utils/jwt";

const payload = { sub: "user_1", email: "ada@example.com", role: "ADMIN" as const };

describe("access tokens", () => {
  it("round-trips its claims", () => {
    const verified = verifyAccessToken(signAccessToken(payload));
    expect(verified).toMatchObject(payload);
  });

  it("rejects a tampered token as a 401 rather than throwing a raw jwt error", () => {
    const token = `${signAccessToken(payload)}x`;
    try {
      verifyAccessToken(token);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(isApiError(error) && error.statusCode).toBe(401);
    }
  });

  it("refuses a refresh token presented as an access token", () => {
    const { token } = signRefreshToken("user_1");
    expect(() => verifyAccessToken(token)).toThrowError(/invalid or expired/);
  });
});

describe("refresh tokens", () => {
  it("carries a unique jti and an expiry in the future", () => {
    const first = signRefreshToken("user_1");
    const second = signRefreshToken("user_1");

    expect(first.jti).not.toBe(second.jti);
    expect(first.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(verifyRefreshToken(first.token).sub).toBe("user_1");
  });

  it("stores the same digest for the same token, and a different one otherwise", () => {
    const { token } = signRefreshToken("user_1");
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toBe(hashToken(`${token}x`));
  });
});
