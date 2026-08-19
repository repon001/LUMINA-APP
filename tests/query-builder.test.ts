import { describe, expect, it } from "vitest";
import { isApiError } from "../src/utils/api-error";
import { buildListQuery, type ListQueryConfig } from "../src/utils/query-builder";

const CONFIG: ListQueryConfig = {
  sortable: ["name", "createdAt", "author.name"],
  filterable: {
    role: { kind: "enum", values: ["ADMIN", "USER"] },
    isActive: { kind: "boolean" },
    createdAt: { kind: "date" },
    price: { kind: "number" },
    authorName: { kind: "string", column: "author.name" },
    tags: { kind: "stringList" },
  },
  searchable: ["name", "email"],
  defaultSort: "-createdAt",
  defaultLimit: 20,
  maxLimit: 50,
};

const build = (query: Record<string, unknown>) => buildListQuery(query, CONFIG);

describe("paging", () => {
  it("defaults to page 1 and the configured limit", () => {
    const result = build({});
    expect(result).toMatchObject({ page: 1, limit: 20, skip: 0, take: 20 });
  });

  it("computes skip from page and limit", () => {
    expect(build({ page: "3", limit: "10" })).toMatchObject({ skip: 20, take: 10 });
  });

  it("caps limit at maxLimit so a client cannot request the whole table", () => {
    expect(build({ limit: "5000" }).take).toBe(50);
  });

  it("rejects a non-positive page", () => {
    expect(() => build({ page: "0" })).toThrowError(/positive integer/);
  });
});

describe("sorting", () => {
  it("applies defaultSort when none is given", () => {
    expect(build({}).orderBy).toEqual([{ createdAt: "desc" }]);
  });

  it("reads a leading dash as descending, and supports several keys", () => {
    expect(build({ sort: "-createdAt,name" }).orderBy).toEqual([
      { createdAt: "desc" },
      { name: "asc" },
    ]);
  });

  it("expands a dotted path into a nested relation sort", () => {
    expect(build({ sort: "author.name" }).orderBy).toEqual([{ author: { name: "asc" } }]);
  });

  it("rejects a field that is not in the allow-list", () => {
    expect(() => build({ sort: "passwordHash" })).toThrowError(/Cannot sort by/);
  });
});

describe("filtering", () => {
  it("matches a declared field exactly", () => {
    expect(build({ role: "ADMIN" }).where).toEqual({ role: "ADMIN" });
  });

  it("drops undeclared params instead of forwarding them to the database", () => {
    expect(build({ passwordHash: "x", isAdmin: "true" }).where).toEqual({});
  });

  it("coerces booleans, numbers and dates", () => {
    expect(build({ isActive: "true" }).where).toEqual({ isActive: true });
    expect(build({ price: "12.5" }).where).toEqual({ price: 12.5 });
    expect(build({ createdAt: "2026-01-01" }).where).toEqual({
      createdAt: new Date("2026-01-01"),
    });
  });

  it("supports range and negation operators", () => {
    expect(build({ price_gte: "10", price_lt: "20" }).where).toEqual({
      AND: [{ price: { gte: 10 } }, { price: { lt: 20 } }],
    });
    expect(build({ role_ne: "ADMIN" }).where).toEqual({ role: { not: "ADMIN" } });
  });

  it("splits _in on commas", () => {
    expect(build({ role_in: "ADMIN,USER" }).where).toEqual({ role: { in: ["ADMIN", "USER"] } });
  });

  it("asks for containment on an array column", () => {
    expect(build({ tags: "sushi" }).where).toEqual({ tags: { has: "sushi" } });
  });

  it("treats _in on an array column as overlap", () => {
    expect(build({ tags_in: "sushi,ramen" }).where).toEqual({
      tags: { hasSome: ["sushi", "ramen"] },
    });
  });

  it("maps a param to a different column when configured", () => {
    expect(build({ authorName: "ada" }).where).toEqual({ author: { name: "ada" } });
  });

  it("rejects a value of the wrong type, as a 400", () => {
    try {
      build({ price: "cheap" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(isApiError(error) && error.statusCode).toBe(400);
    }
  });

  it("rejects a value outside an enum", () => {
    expect(() => build({ role: "SUPERUSER" })).toThrowError(/must be one of/);
  });
});

describe("search", () => {
  it("builds a case-insensitive OR across the searchable fields", () => {
    expect(build({ q: "ada" }).where).toEqual({
      OR: [
        { name: { contains: "ada", mode: "insensitive" } },
        { email: { contains: "ada", mode: "insensitive" } },
      ],
    });
  });

  it("combines search with filters under AND", () => {
    expect(build({ q: "ada", role: "ADMIN" }).where).toEqual({
      AND: [{ role: "ADMIN" }, { OR: expect.any(Array) }],
    });
  });

  it("ignores a blank search", () => {
    expect(build({ q: "   " }).where).toEqual({});
  });
});
