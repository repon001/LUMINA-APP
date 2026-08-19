import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/utils/password";

describe("password hashing", () => {
  it("never stores the plaintext, and salts each hash separately", async () => {
    const first = await hashPassword("Password123!");
    const second = await hashPassword("Password123!");

    expect(first).not.toContain("Password123!");
    expect(first).not.toBe(second);
  });

  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("Password123!");

    await expect(verifyPassword("Password123!", hash)).resolves.toBe(true);
    await expect(verifyPassword("password123!", hash)).resolves.toBe(false);
  });
});
