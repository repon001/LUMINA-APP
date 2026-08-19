import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "../src/utils/slug";

describe("slugify", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugify("Tokyo Tower")).toBe("tokyo-tower");
  });

  it("folds accents instead of dropping the letters", () => {
    expect(slugify("Kyōto Station")).toBe("kyoto-station");
    expect(slugify("Café de Flore")).toBe("cafe-de-flore");
  });

  it("collapses punctuation and trims stray hyphens", () => {
    expect(slugify("  Shibuya   Crossing!! ")).toBe("shibuya-crossing");
    expect(slugify("--Osaka--")).toBe("osaka");
  });

  it("truncates without leaving a trailing hyphen", () => {
    expect(slugify("a".repeat(40) + " " + "b".repeat(40), 41)).toBe("a".repeat(40));
  });
});

describe("uniqueSlug", () => {
  it("keeps the plain slug when it is free", async () => {
    expect(await uniqueSlug("Tokyo Tower", async () => false)).toBe("tokyo-tower");
  });

  it("counts up until it finds a free one", async () => {
    const taken = new Set(["tokyo-tower", "tokyo-tower-2"]);
    expect(await uniqueSlug("Tokyo Tower", async (c) => taken.has(c))).toBe("tokyo-tower-3");
  });

  it("falls back to a random tail rather than throwing", async () => {
    const result = await uniqueSlug("Tokyo Tower", async () => true, 3);
    expect(result).toMatch(/^tokyo-tower-[a-z0-9]{6}$/);
  });

  it("still produces something for a name with no usable characters", async () => {
    expect(await uniqueSlug("!!!", async () => false)).toBe("item");
  });
});
