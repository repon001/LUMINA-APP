import type { PaymentProvider, PaymentStatus } from "../../generated/prisma/client";

export interface CheckoutRequest {
  /** Our reference, echoed back by the gateway so a callback finds the row. */
  reference: string;
  /** Exact decimal string, e.g. "1100.00". */
  amount: string;
  currencyCode: string;
  description: string;
  customer: { id: string; name: string; email: string };
  successUrl: string;
  cancelUrl: string;
  /** Where the gateway should call us server-to-server. */
  webhookUrl: string;
}

export interface CheckoutSession {
  providerRef: string;
  checkoutUrl: string;
}

/** What a callback told us about one payment. */
export interface PaymentOutcome {
  reference: string;
  status: PaymentStatus;
  providerRef?: string;
  failureReason?: string;
  /** Amount the gateway says was paid, checked against what we asked for. */
  paidAmount?: string;
  paidCurrency?: string;
  raw: unknown;
}

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  /** False when its keys are missing, so checkout can fail with a clear 503. */
  readonly isConfigured: boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Verifies a callback and says what it means.
   *
   * Takes the raw body as well as the parsed one: Stripe signs the exact bytes,
   * so re-serialising the parsed JSON would break the signature.
   */
  handleCallback(input: {
    rawBody: Buffer | undefined;
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<PaymentOutcome>;
}

/**
 * Currencies with no minor unit. Stripe wants amounts in the smallest unit, so
 * 1000 JPY is 1000 while 10.00 USD is 1000 - the same integer meaning different
 * money. Getting this wrong charges a customer a hundred times over.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export const isZeroDecimalCurrency = (currencyCode: string) =>
  ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase());

/** "10.00" USD -> 1000, "1000.00" JPY -> 1000. */
export const toMinorUnits = (amount: string, currencyCode: string): number => {
  const value = Number(amount);
  if (!Number.isFinite(value)) throw new Error(`Amount "${amount}" is not a number`);

  const minor = isZeroDecimalCurrency(currencyCode) ? value : value * 100;
  return Math.round(minor);
};

/** The inverse, for comparing what a gateway says it charged. */
export const fromMinorUnits = (minor: number, currencyCode: string): string =>
  isZeroDecimalCurrency(currencyCode) ? minor.toFixed(2) : (minor / 100).toFixed(2);
