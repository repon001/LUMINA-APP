import type { Request, Response } from "express";
import { sendPaginated, sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { param, requireUser, requireUserId } from "../../utils/request";
import * as expenseService from "./expense.service";
import type { CreateExpenseInput, UpdateExpenseInput } from "./expense.validation";

export const ExpenseController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const result = await expenseService.listExpenses(
      param(req, "tripId"),
      requireUser(req),
      req.query as Record<string, unknown>,
    );
    sendPaginated(res, "Expenses fetched", result);
  }),

  summary: catchAsync(async (req: Request, res: Response) => {
    const summary = await expenseService.getBudgetSummary(param(req, "tripId"), requireUser(req));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Budget summary fetched",
      data: summary,
    });
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    const expense = await expenseService.createExpense(
      param(req, "tripId"),
      requireUser(req),
      requireUserId(req),
      req.body as CreateExpenseInput,
    );
    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: "Expense recorded",
      data: expense,
    });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const expense = await expenseService.updateExpense(
      param(req, "tripId"),
      param(req, "expenseId"),
      requireUser(req),
      req.body as UpdateExpenseInput,
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Expense updated",
      data: expense,
    });
  }),

  remove: catchAsync(async (req: Request, res: Response) => {
    await expenseService.deleteExpense(
      param(req, "tripId"),
      param(req, "expenseId"),
      requireUser(req),
    );
    sendResponse(res, { statusCode: 200, success: true, message: "Expense deleted", data: null });
  }),
};
