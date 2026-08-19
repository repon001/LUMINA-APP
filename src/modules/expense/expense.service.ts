import { ExpenseCategory, Prisma } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/api-error";
import { buildListQuery, type ListQueryConfig } from "../../utils/query-builder";
import { findEditableTrip, type TripViewer } from "../trip/trip.access";
import type { CreateExpenseInput, UpdateExpenseInput } from "./expense.validation";

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["spentAt", "amount", "category", "createdAt"],
  filterable: {
    category: { kind: "enum", values: Object.values(ExpenseCategory) },
    currencyCode: { kind: "string" },
    spentAt: { kind: "date" },
    paidById: { kind: "string" },
  },
  searchable: ["title", "notes"],
  defaultSort: "-spentAt",
};

const EXPENSE_SELECT = {
  id: true,
  title: true,
  amount: true,
  currencyCode: true,
  category: true,
  spentAt: true,
  notes: true,
  createdAt: true,
  paidBy: { select: { id: true, name: true } },
  place: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.ExpenseSelect;

/** Spending is warned about at 80% of budget, and flagged past 100%. */
const NEAR_LIMIT_RATIO = 0.8;

export type BudgetStatus = "NO_BUDGET" | "UNDER" | "NEAR" | "OVER";

/**
 * Turns "how much of the budget is gone" into the state the app animates.
 *
 * Pure, so the thresholds are testable without a trip, a database or money.
 */
export const budgetStatus = (usedRatio: number | null): BudgetStatus => {
  if (usedRatio === null) return "NO_BUDGET";
  if (usedRatio > 1) return "OVER";
  if (usedRatio >= NEAR_LIMIT_RATIO) return "NEAR";
  return "UNDER";
};

const requirePlace = async (placeId: string) => {
  const place = await prisma.place.findUnique({ where: { id: placeId }, select: { id: true } });
  if (!place) throw ApiError.notFound("Place not found");
};

const requireExpenseOfTrip = async (tripId: string, expenseId: string) => {
  const expense = await prisma.expense.findFirst({ where: { id: expenseId, tripId } });
  if (!expense) throw ApiError.notFound("Expense not found on this trip");
  return expense;
};

export const listExpenses = async (
  tripId: string,
  viewer: TripViewer,
  query: Record<string, unknown>,
) => {
  await findEditableTrip(tripId, viewer);
  const { where, orderBy, skip, take, page, limit } = buildListQuery(query, LIST_CONFIG);

  const scoped = { AND: [{ tripId }, where] };
  const [items, total] = await Promise.all([
    prisma.expense.findMany({ where: scoped, orderBy, skip, take, select: EXPENSE_SELECT }),
    prisma.expense.count({ where: scoped }),
  ]);

  return { items, total, page, limit };
};

export const createExpense = async (
  tripId: string,
  viewer: TripViewer,
  paidById: string,
  input: CreateExpenseInput,
) => {
  await findEditableTrip(tripId, viewer);
  if (input.placeId) await requirePlace(input.placeId);

  return prisma.expense.create({
    data: {
      tripId,
      paidById,
      title: input.title,
      amount: input.amount,
      currencyCode: input.currencyCode,
      category: input.category ?? ExpenseCategory.OTHER,
      spentAt: input.spentAt,
      placeId: input.placeId ?? null,
      notes: input.notes ?? null,
    },
    select: EXPENSE_SELECT,
  });
};

export const updateExpense = async (
  tripId: string,
  expenseId: string,
  viewer: TripViewer,
  input: UpdateExpenseInput,
) => {
  await findEditableTrip(tripId, viewer);
  await requireExpenseOfTrip(tripId, expenseId);
  if (input.placeId) await requirePlace(input.placeId);

  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.spentAt !== undefined ? { spentAt: input.spentAt } : {}),
      ...(input.placeId !== undefined ? { placeId: input.placeId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    select: EXPENSE_SELECT,
  });
};

export const deleteExpense = async (tripId: string, expenseId: string, viewer: TripViewer) => {
  await findEditableTrip(tripId, viewer);
  await requireExpenseOfTrip(tripId, expenseId);

  await prisma.expense.delete({ where: { id: expenseId } });
};

export interface BudgetSummary {
  budgetTotal: string | null;
  currencyCode: string | null;
  spent: string;
  remaining: string | null;
  usedRatio: number | null;
  status: BudgetStatus;
  byCategory: { category: ExpenseCategory; amount: string; share: number }[];
  byDay: { date: string; amount: string }[];
  /** Totals in currencies other than the trip's, left unconverted on purpose. */
  otherCurrencies: { currencyCode: string; amount: string }[];
  expenseCount: number;
}

const zero = () => new Prisma.Decimal(0);
const sum = (values: (Prisma.Decimal | null)[]) =>
  values.reduce<Prisma.Decimal>((total, value) => total.plus(value ?? 0), zero());

/**
 * What the budget screen needs, in one query round.
 *
 * Expenses in a currency other than the trip's are reported separately rather
 * than converted: a rate applied here would be today's, while the money was
 * spent at some other day's rate. Conversion belongs to the client (or to a
 * rates service), with the raw numbers kept honest.
 */
export const getBudgetSummary = async (
  tripId: string,
  viewer: TripViewer,
): Promise<BudgetSummary> => {
  const trip = await findEditableTrip(tripId, viewer);

  const expenses = await prisma.expense.findMany({
    where: { tripId },
    select: { amount: true, currencyCode: true, category: true, spentAt: true },
  });

  // The trip's own currency, or - when it has none - whatever was spent most.
  const currencyCode =
    trip.currencyCode ??
    [...new Set(expenses.map((expense) => expense.currencyCode))].sort(
      (a, b) =>
        expenses.filter((expense) => expense.currencyCode === b).length -
        expenses.filter((expense) => expense.currencyCode === a).length,
    )[0] ??
    null;

  const inCurrency = expenses.filter((expense) => expense.currencyCode === currencyCode);
  const spent = sum(inCurrency.map((expense) => expense.amount));

  const byCategory = Object.values(ExpenseCategory)
    .map((category) => {
      const amount = sum(
        inCurrency.filter((expense) => expense.category === category).map((e) => e.amount),
      );
      return {
        category,
        amount: amount.toFixed(2),
        share: spent.isZero() ? 0 : Math.round(amount.div(spent).toNumber() * 1000) / 1000,
      };
    })
    .filter((row) => row.amount !== "0.00");

  const dayTotals = new Map<string, Prisma.Decimal>();
  for (const expense of inCurrency) {
    const day = expense.spentAt.toISOString().slice(0, 10);
    dayTotals.set(day, (dayTotals.get(day) ?? zero()).plus(expense.amount));
  }

  const otherCurrencies = [
    ...new Set(expenses.filter((e) => e.currencyCode !== currencyCode).map((e) => e.currencyCode)),
  ].map((code) => ({
    currencyCode: code,
    amount: sum(
      expenses.filter((expense) => expense.currencyCode === code).map((e) => e.amount),
    ).toFixed(2),
  }));

  const budgetTotal = trip.budgetTotal;
  const usedRatio =
    budgetTotal && !budgetTotal.isZero()
      ? Math.round(spent.div(budgetTotal).toNumber() * 1000) / 1000
      : null;

  return {
    budgetTotal: budgetTotal ? budgetTotal.toFixed(2) : null,
    currencyCode,
    spent: spent.toFixed(2),
    remaining: budgetTotal ? budgetTotal.minus(spent).toFixed(2) : null,
    usedRatio,
    status: budgetStatus(usedRatio),
    byCategory: byCategory.sort((a, b) => Number(b.amount) - Number(a.amount)),
    byDay: [...dayTotals.entries()]
      .map(([date, amount]) => ({ date, amount: amount.toFixed(2) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    otherCurrencies,
    expenseCount: expenses.length,
  };
};
