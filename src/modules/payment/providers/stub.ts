import { PaymentProvider, PaymentStatus } from "../../../generated/prisma/client";
import { env } from "../../../config/env";
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentGateway,
  PaymentOutcome,
} from "../payment.provider";

/**
 * A gateway that settles locally, so the whole payment flow can be exercised
 * without Stripe keys, an SSLCommerz store, or a public tunnel for callbacks.
 *
 * Its "checkout page" is an endpoint on this API that posts the outcome back to
 * the same webhook the real gateways use, so the code path under test is the
 * real one. Refused in production - a gateway that approves its own payments is
 * a hole, not a convenience.
 */
export const stubGateway: PaymentGateway = {
  provider: PaymentProvider.STUB,
  get isConfigured() {
    return env.PAYMENT_ALLOW_STUB && !env.isProduction;
  },

  async createCheckout(input: CheckoutRequest): Promise<CheckoutSession> {
    const url = new URL(`${env.PUBLIC_BASE_URL}/api/payments/stub/checkout`);
    url.searchParams.set("reference", input.reference);
    url.searchParams.set("amount", input.amount);
    url.searchParams.set("currency", input.currencyCode);

    return { providerRef: `stub_${input.reference}`, checkoutUrl: url.toString() };
  },

  async handleCallback({ body }): Promise<PaymentOutcome> {
    const payload = (body ?? {}) as {
      reference?: string;
      outcome?: string;
      amount?: string;
      currency?: string;
    };

    const succeeded = (payload.outcome ?? "success").toLowerCase() === "success";

    return {
      reference: payload.reference ?? "",
      status: succeeded ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
      providerRef: `stub_${payload.reference ?? ""}`,
      ...(succeeded ? {} : { failureReason: "Declined by the stub gateway" }),
      ...(payload.amount ? { paidAmount: payload.amount } : {}),
      ...(payload.currency ? { paidCurrency: payload.currency.toUpperCase() } : {}),
      raw: payload,
    };
  },
};
