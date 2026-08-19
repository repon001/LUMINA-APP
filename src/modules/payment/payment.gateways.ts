import { PaymentProvider } from "../../generated/prisma/client";
import { ApiError } from "../../utils/api-error";
import type { PaymentGateway } from "./payment.provider";
import { sslcommerzGateway } from "./providers/sslcommerz";
import { stripeGateway } from "./providers/stripe";
import { stubGateway } from "./providers/stub";

const GATEWAYS: Record<PaymentProvider, PaymentGateway> = {
  [PaymentProvider.STRIPE]: stripeGateway,
  [PaymentProvider.SSLCOMMERZ]: sslcommerzGateway,
  [PaymentProvider.STUB]: stubGateway,
};

/**
 * A gateway that is actually usable.
 *
 * Missing keys are a `503`, not a `500`: nothing is broken, the deployment
 * simply has not been given credentials for that provider yet.
 */
export const gatewayFor = (provider: PaymentProvider): PaymentGateway => {
  const gateway = GATEWAYS[provider];
  if (!gateway.isConfigured) {
    throw ApiError.serviceUnavailable(`${provider} payments are not configured on this server`);
  }
  return gateway;
};

/** What the client can offer today, so the app does not show a dead button. */
export const availableProviders = (): PaymentProvider[] =>
  Object.values(PaymentProvider).filter((provider) => GATEWAYS[provider].isConfigured);
