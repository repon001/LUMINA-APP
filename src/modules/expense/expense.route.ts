import { Router } from "express";
import { z } from "zod";
import { ExpenseController } from "./expense.controller";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { createExpenseSchema, updateExpenseSchema } from "./expense.validation";

/** Mounted at `/trips/:tripId/expenses`; mergeParams keeps `tripId` visible. */
const router = Router({ mergeParams: true });

const tripParams = z.object({ tripId: z.string().min(1) });
const expenseParams = tripParams.extend({ expenseId: z.string().min(1) });

// Money is private even when the trip is public, so every route needs a token
// and the service checks edit access rather than view access.
router.use(authenticate);

router.get("/", validate({ params: tripParams }), ExpenseController.list);

// Before "/:expenseId", or "summary" is read as an expense id.
router.get("/summary", validate({ params: tripParams }), ExpenseController.summary);

router.post(
  "/",
  validate({ params: tripParams, body: createExpenseSchema }),
  ExpenseController.create,
);

router.patch(
  "/:expenseId",
  validate({ params: expenseParams, body: updateExpenseSchema }),
  ExpenseController.update,
);

router.delete("/:expenseId", validate({ params: expenseParams }), ExpenseController.remove);

export default router;
