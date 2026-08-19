import { describe, expect, it } from "vitest";
import { buildPageMeta } from "../src/utils/api-response";

describe("buildPageMeta", () => {
  it("reports the middle of a result set", () => {
    expect(buildPageMeta(2, 10, 35)).toEqual({
      page: 2,
      limit: 10,
      total: 35,
      totalPages: 4,
      hasNext: true,
      hasPrev: true,
    });
  });

  it("has no next page on the last one", () => {
    expect(buildPageMeta(4, 10, 35)).toMatchObject({ hasNext: false, hasPrev: true });
  });

  it("handles an empty result set without claiming a page exists", () => {
    expect(buildPageMeta(1, 10, 0)).toMatchObject({
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });
});
