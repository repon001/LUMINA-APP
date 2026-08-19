import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentProvider, PaymentStatus } from "../../../generated/prisma/client";
import { env } from "../../../config/env";
import { ApiError } from "../../../utils/api-error";
import {
  fromMinorUnits,
  toMinorUnits,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentGateway,
  type PaymentOutcome,
} from "../payment.provider";

const API = "https://api.stripe.com/v1/checkout/sessions";

/** Stripe rejects a signature whose timestamp is far from now. So do we. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

interface StripeSession {
  id: string;
  url: string;
  client_reference_id?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
}

interface StripeEvent {
  type: string;
  data: { object: StripeSession };
}

/**
 * Talks to Stripe over plain HTTP rather than through the SDK.
 *
 * Checkout is two calls and one signature check; the SDK would add a dependency
 * and its own release cadence for very little. If this grows past webhooks and
 * sessions, the SDK becomes the right trade.
 */
const request = async (body: URLSearchParams) => {
  const response = await fetch(API, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = (await response.json()) as StripeSession & { error?: { message: string } };
  if (!response.ok) {
    throw ApiError.badRequest(`Stripe rejected the checkout: ${json.error?.message ?? "unknown"}`);
  }
  return json;
};

/**
 * `stripe-signature: t=1699…,v1=hex`. The signed payload is `${t}.${rawBody}`,
 * HMAC-SHA256 with the endpoint secret. Compared in constant time, because a
 * timing-variable compare on a signature is a real leak.
 */
export const verifyStripeSignature = (
  rawBody: Buffer,
  header: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean => {
  const parts = Object.fromEntries(
    header
      .split(",")
      .map((part) => part.split("="))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([key, value]) => [key.trim(), value.trim()]),
  );

  const timestamp = Number(parts["t"]);
  const signature = parts["v1"];
  if (!Number.isFinite(timestamp) || !signature) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");

  const given = Buffer.from(signature, "utf8");
  const mine = Buffer.from(expected, "utf8");
  return given.length === mine.length && timingSafeEqual(given, mine);
};

/** Only the events that change a payment's fate are acted on. */
const statusForEvent = (type: string): PaymentStatus | undefined => {
  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return PaymentStatus.SUCCEEDED;
    case "checkout.session.async_payment_failed":
      return PaymentStatus.FAILED;
    case "checkout.session.expired":
      return PaymentStatus.CANCELLED;
    default:
      return undefined;
  }
};

export const stripeGateway: PaymentGateway = {
  provider: PaymentProvider.STRIPE,
  get isConfigured() {
    return Boolean(env.STRIPE_SECRET_KEY);
  },

  async createCheckout(input: CheckoutRequest): Promise<CheckoutSession> {
    const body = new URLSearchParams({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.reference,
      customer_email: input.customer.email,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": input.currencyCode.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(
        toMinorUnits(input.amount, input.currencyCode),
      ),
      "line_items[0][price_data][product_data][name]": input.description,
      "metadata[reference]": input.reference,
      "metadata[userId]": input.customer.id,
    });

    const session = await request(body);
    return { providerRef: session.id, checkoutUrl: session.url };
  },

  async handleCallback({ rawBody, headers }): Promise<PaymentOutcome> {
    const secret = env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw ApiError.serviceUnavailable("Stripe webhook secret is not configured");

    const signature = headers["stripe-signature"];
    if (!rawBody || typeof signature !== "string") {
      throw ApiError.badRequest("Missing Stripe signature");
    }
    if (!verifyStripeSignature(rawBody, signature, secret)) {
      // Unsigned callbacks are forged until proven otherwise.
      throw ApiError.unauthorized("Stripe signature does not match");
    }

    const event = JSON.parse(rawBody.toString("utf8")) as StripeEvent;
    const session = event.data.object;
    const status = statusForEvent(event.type);
    const reference = session.client_reference_id ?? "";

    if (!status || !reference) {
      // An event we do not act on, or one with nothing to match: acknowledged
      // so Stripe stops retrying, but nothing changes.
      return { reference, status: PaymentStatus.PENDING, raw: event };
    }

    return {
      reference,
      status,
      providerRef: session.id,
      // Stripe reports minor units; the rest of the system speaks decimals.
      ...(session.amount_total !== undefined && session.currency
        ? {
            paidAmount: fromMinorUnits(session.amount_total, session.currency),
            paidCurrency: session.currency.toUpperCase(),
          }
        : {}),
      raw: event,
    };
  },
};
