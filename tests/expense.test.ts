import { describe, expect, it } from "vitest";
import { budgetStatus } from "../src/modules/expense/expense.service";
import {
  createExpenseSchema,
  updateExpenseSchema,
} from "../src/modules/expense/expense.validation";

const valid = {
  title: "Ramen",
  amount: 12.5,
  currencyCode: "jpy",
  spentAt: "2026-10-05",
};

describe("createExpenseSchema", () => {
  it("normalises amount and currency", () => {
    const parsed = createExpenseSchema.parse(valid);
    expect(parsed.amount).toBe("12.50");
    expect(parsed.currencyCode).toBe("JPY");
  });

  it("reads spentAt as a calendar day", () => {
    expect(createExpenseSchema.parse(valid).spentAt.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("requires a currency, because an amount alone means nothing", () => {
    const { currencyCode, ...withoutCurrency } = valid;
    expect(currencyCode).toBeTruthy();
    expect(createExpenseSchema.safeParse(withoutCurrency).success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(createExpenseSchema.safeParse({ ...valid, amount: -5 }).success).toBe(false);
  });

  it("accepts zero, which is a real free entry", () => {
    expect(createExpenseSchema.parse({ ...valid, amount: 0 }).amount).toBe("0.00");
  });

  it("only accepts known categories", () => {
    expect(createExpenseSchema.safeParse({ ...valid, category: "FOOD" }).success).toBe(true);
    expect(createExpenseSchema.safeParse({ ...valid, category: "SNACKS" }).success).toBe(false);
  });

  it("defaults the category at the service, not the schema", () => {
    expect(createExpenseSchema.parse(valid).category).toBeUndefined();
  });
});

describe("updateExpenseSchema", () => {
  it("allows detaching a place", () => {
    expect(updateExpenseSchema.parse({ placeId: null })).toEqual({ placeId: null });
  });

  it("refuses an empty body", () => {
    expect(updateExpenseSchema.safeParse({}).success).toBe(false);
  });
});

describe("budgetStatus", () => {
  it("says nothing when there is no budget to compare against", () => {
    expect(budgetStatus(null)).toBe("NO_BUDGET");
  });

  it("is under below 80 percent", () => {
    expect(budgetStatus(0)).toBe("UNDER");
    expect(budgetStatus(0.79)).toBe("UNDER");
  });

  it("warns from 80 percent up to the limit", () => {
    expect(budgetStatus(0.8)).toBe("NEAR");
    expect(budgetStatus(1)).toBe("NEAR");
  });

  it("only flags OVER past the limit, not at it", () => {
    expect(budgetStatus(1.0001)).toBe("OVER");
    expect(budgetStatus(1.9)).toBe("OVER");
  });
});
