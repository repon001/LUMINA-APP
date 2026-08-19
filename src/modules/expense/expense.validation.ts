import { z } from "zod";
import { ExpenseCategory } from "../../generated/prisma/client";
import { currencyCode, dateOnly, money } from "../../utils/common.validation";

export const createExpenseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  amount: money("Amount"),
  currencyCode,
  category: z.enum(ExpenseCategory).optional(),
  spentAt: dateOnly("spentAt"),
  placeId: z.string().min(1).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateExpenseSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    amount: money("Amount").optional(),
    currencyCode: currencyCode.optional(),
    category: z.enum(ExpenseCategory).optional(),
    spentAt: dateOnly("spentAt").optional(),
    placeId: z.string().min(1).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
