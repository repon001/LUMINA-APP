import { PaymentProvider, PaymentStatus } from "../../../generated/prisma/client";
import { env } from "../../../config/env";
import { ApiError } from "../../../utils/api-error";
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentGateway,
  PaymentOutcome,
} from "../payment.provider";

const host = () =>
  env.SSLCOMMERZ_SANDBOX ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";

interface InitResponse {
  status: string;
  sessionkey?: string;
  GatewayPageURL?: string;
  failedreason?: string;
}

interface ValidationResponse {
  status: string;
  tran_id?: string;
  amount?: string;
  currency?: string;
  val_id?: string;
  error?: string;
}

/** What SSLCommerz posts to the IPN url. Everything arrives as form fields. */
interface IpnBody {
  tran_id?: string;
  val_id?: string;
  status?: string;
  amount?: string;
  currency?: string;
  error?: string;
}

const form = (fields: Record<string, string>) => new URLSearchParams(fields);

/**
 * SSLCommerz is Bangladesh's dominant gateway, and its flow differs from
 * Stripe's in one important way: the IPN is not signed. Anyone can post to the
 * callback url claiming a payment succeeded.
 *
 * The `val_id` in that post is the only thing worth trusting, and only after it
 * has been exchanged for a validation response fetched directly from
 * SSLCommerz with the store credentials. That second call is what makes the
 * callback safe.
 */
const validate = async (valId: string): Promise<ValidationResponse> => {
  const url = new URL(`${host()}/validator/api/validationserverAPI.php`);
  url.searchParams.set("val_id", valId);
  url.searchParams.set("store_id", env.SSLCOMMERZ_STORE_ID ?? "");
  url.searchParams.set("store_passwd", env.SSLCOMMERZ_STORE_PASSWORD ?? "");
  url.searchParams.set("format", "json");

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw ApiError.serviceUnavailable("SSLCommerz validation is unreachable");
  }
  return (await response.json()) as ValidationResponse;
};

const statusFor = (raw: string | undefined): PaymentStatus => {
  switch ((raw ?? "").toUpperCase()) {
    case "VALID":
    case "VALIDATED":
      return PaymentStatus.SUCCEEDED;
    case "CANCELLED":
      return PaymentStatus.CANCELLED;
    default:
      return PaymentStatus.FAILED;
  }
};

export const sslcommerzGateway: PaymentGateway = {
  provider: PaymentProvider.SSLCOMMERZ,
  get isConfigured() {
    return Boolean(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD);
  },

  async createCheckout(input: CheckoutRequest): Promise<CheckoutSession> {
    const response = await fetch(`${host()}/gwprocess/v4/api.php`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        store_id: env.SSLCOMMERZ_STORE_ID ?? "",
        store_passwd: env.SSLCOMMERZ_STORE_PASSWORD ?? "",
        total_amount: input.amount,
        currency: input.currencyCode,
        tran_id: input.reference,
        success_url: input.successUrl,
        fail_url: input.cancelUrl,
        cancel_url: input.cancelUrl,
        ipn_url: input.webhookUrl,
        product_name: input.description,
        product_category: "travel",
        product_profile: "travel-vertical",
        cus_name: input.customer.name,
        cus_email: input.customer.email,
        // Required by the gateway even for a digital purchase.
        cus_add1: "N/A",
        cus_city: "N/A",
        cus_country: "Bangladesh",
        cus_phone: "N/A",
        shipping_method: "NO",
      }),
    });

    const json = (await response.json()) as InitResponse;
    if (json.status !== "SUCCESS" || !json.GatewayPageURL) {
      throw ApiError.badRequest(
        `SSLCommerz rejected the checkout: ${json.failedreason ?? json.status}`,
      );
    }

    return { providerRef: json.sessionkey ?? input.reference, checkoutUrl: json.GatewayPageURL };
  },

  async handleCallback({ body }): Promise<PaymentOutcome> {
    const ipn = (body ?? {}) as IpnBody;
    const reference = ipn.tran_id ?? "";
    if (!reference) throw ApiError.badRequest("SSLCommerz callback has no tran_id");

    // A cancellation carries no val_id, so there is nothing to validate.
    if (!ipn.val_id) {
      return {
        reference,
        status: statusFor(ipn.status),
        failureReason: ipn.error ?? "No validation id in callback",
        raw: ipn,
      };
    }

    const validation = await validate(ipn.val_id);
    const status = statusFor(validation.status);

    return {
      reference,
      status,
      providerRef: validation.val_id ?? ipn.val_id,
      ...(status === PaymentStatus.SUCCEEDED
        ? {}
        : { failureReason: validation.error ?? validation.status }),
      ...(validation.amount ? { paidAmount: Number(validation.amount).toFixed(2) } : {}),
      ...(validation.currency ? { paidCurrency: validation.currency.toUpperCase() } : {}),
      raw: validation,
    };
  },
};
