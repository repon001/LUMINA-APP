import { z } from "zod";
import { PaymentProvider, PaymentPurpose } from "../../generated/prisma/client";
import { currencyCode, money } from "../../utils/common.validation";

export const createCheckoutSchema = z.object({
  provider: z.enum(PaymentProvider),
  amount: money("Amount").refine((value) => Number(value) > 0, {
    message: "Amount must be greater than zero",
  }),
  currencyCode,
  description: z.string().trim().min(2, "Describe what is being paid for").max(200),
  purpose: z.enum(PaymentPurpose).optional(),
  tripId: z.string().min(1).optional(),
  placeId: z.string().min(1).optional(),
});

/** Only the stub gateway takes this: it is how a local test decides an outcome. */
export const stubOutcomeSchema = z.object({
  reference: z.string().min(1),
  outcome: z.enum(["success", "fail"]).default("success"),
  amount: z.string().optional(),
  currency: z.string().optional(),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type StubOutcomeInput = z.infer<typeof stubOutcomeSchema>;
