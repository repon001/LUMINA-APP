import { randomBytes } from "node:crypto";
import {
  PaymentStatus,
  Role,
  type PaymentProvider,
  type Prisma,
} from "../../generated/prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/api-error";
import { buildListQuery, type ListQueryConfig } from "../../utils/query-builder";
import type { AuthenticatedUser } from "../../utils/request";
import { gatewayFor } from "./payment.gateways";
import type { PaymentOutcome } from "./payment.provider";
import type { CreateCheckoutInput } from "./payment.validation";

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "amount", "status", "paidAt"],
  filterable: {
    status: { kind: "enum", values: Object.values(PaymentStatus) },
    provider: { kind: "string" },
    tripId: { kind: "string" },
    createdAt: { kind: "date" },
  },
  searchable: ["description", "reference"],
  defaultSort: "-createdAt",
};

const PAYMENT_SELECT = {
  id: true,
  provider: true,
  purpose: true,
  status: true,
  amount: true,
  currencyCode: true,
  description: true,
  reference: true,
  checkoutUrl: true,
  paidAt: true,
  failureReason: true,
  createdAt: true,
  trip: { select: { id: true, title: true } },
  place: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.PaymentSelect;

/** Ours, not the gateway's: prefixed so it is recognisable in their dashboard. */
const newReference = () => `lum_${randomBytes(9).toString("hex")}`;

export const listMyPayments = async (userId: string, query: Record<string, unknown>) => {
  const { where, orderBy, skip, take, page, limit } = buildListQuery(query, LIST_CONFIG);

  const scoped = { AND: [{ userId }, where] };
  const [items, total] = await Promise.all([
    prisma.payment.findMany({ where: scoped, orderBy, skip, take, select: PAYMENT_SELECT }),
    prisma.payment.count({ where: scoped }),
  ]);

  return { items, total, page, limit };
};

export const getPayment = async (id: string, viewer: AuthenticatedUser) => {
  const payment = await prisma.payment.findUnique({ where: { id }, select: PAYMENT_SELECT });
  if (!payment) throw ApiError.notFound("Payment not found");

  const owned = await prisma.payment.findFirst({
    where: { id, userId: viewer.id },
    select: { id: true },
  });
  if (!owned && viewer.role !== Role.ADMIN) throw ApiError.notFound("Payment not found");

  return payment;
};

/**
 * Creates the payment row first, then asks the gateway for a checkout session.
 *
 * That order matters: the reference has to exist on our side before the gateway
 * can echo it back. If the gateway call fails, the row is marked FAILED rather
 * than deleted - a customer who saw an error and a support agent looking for it
 * should find the same thing.
 */
export const startCheckout = async (user: AuthenticatedUser, input: CreateCheckoutInput) => {
  const gateway = gatewayFor(input.provider);

  if (input.tripId) {
    const trip = await prisma.trip.findFirst({
      where: { id: input.tripId, ownerId: user.id },
      select: { id: true },
    });
    if (!trip) throw ApiError.notFound("Trip not found");
  }
  if (input.placeId) {
    const place = await prisma.place.findUnique({
      where: { id: input.placeId },
      select: { id: true },
    });
    if (!place) throw ApiError.notFound("Place not found");
  }

  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      tripId: input.tripId ?? null,
      placeId: input.placeId ?? null,
      provider: input.provider,
      purpose: input.purpose ?? "BOOKING",
      amount: input.amount,
      currencyCode: input.currencyCode,
      description: input.description,
      reference: newReference(),
    },
  });

  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { name: true, email: true },
  });

  try {
    const session = await gateway.createCheckout({
      reference: payment.reference,
      amount: payment.amount.toFixed(2),
      currencyCode: payment.currencyCode,
      description: payment.description,
      customer: { id: user.id, name: profile.name, email: profile.email },
      successUrl: env.PAYMENT_SUCCESS_URL,
      cancelUrl: env.PAYMENT_CANCEL_URL,
      webhookUrl: `${env.PUBLIC_BASE_URL}/api/payments/webhook/${input.provider.toLowerCase()}`,
    });

    return prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: session.providerRef, checkoutUrl: session.checkoutUrl },
      select: PAYMENT_SELECT,
    });
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: error instanceof Error ? error.message : "Checkout could not be created",
      },
    });
    throw error;
  }
};

export interface SettlementResult {
  handled: boolean;
  reference: string;
  status: PaymentStatus;
  reason?: string;
}

/**
 * Applies a gateway callback to a payment.
 *
 * Three things make this safe, and all three are needed:
 *
 * 1. **Authenticity** - the gateway adapter verifies the callback before this
 *    runs (a Stripe signature, an SSLCommerz validation call). An unsigned POST
 *    never reaches here.
 * 2. **Idempotency** - gateways retry, sometimes for days. A payment already in
 *    a final state is left alone and reported as handled, so a retry is a
 *    no-op rather than a second fulfilment.
 * 3. **Amount** - what the gateway says was charged is compared to what we
 *    asked for. A callback claiming success for a different amount or currency
 *    is a tampered or mismatched payment, and is recorded as FAILED.
 */
export const settlePayment = async (
  provider: PaymentProvider,
  callback: {
    rawBody: Buffer | undefined;
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
  },
): Promise<SettlementResult> => {
  const gateway = gatewayFor(provider);
  const outcome: PaymentOutcome = await gateway.handleCallback(callback);

  if (!outcome.reference) {
    return { handled: false, reference: "", status: PaymentStatus.PENDING, reason: "no reference" };
  }

  const payment = await prisma.payment.findUnique({ where: { reference: outcome.reference } });
  if (!payment) {
    // Acknowledged rather than 404'd: the gateway would otherwise retry a
    // callback that can never match anything here.
    console.warn(`[payment] callback for unknown reference ${outcome.reference}`);
    return {
      handled: false,
      reference: outcome.reference,
      status: PaymentStatus.PENDING,
      reason: "unknown reference",
    };
  }

  const isFinal =
    payment.status === PaymentStatus.SUCCEEDED || payment.status === PaymentStatus.REFUNDED;
  if (isFinal) {
    return {
      handled: true,
      reference: payment.reference,
      status: payment.status,
      reason: "already settled",
    };
  }

  if (outcome.status === PaymentStatus.PENDING) {
    return {
      handled: true,
      reference: payment.reference,
      status: payment.status,
      reason: "event ignored",
    };
  }

  const metadata = outcome.raw as Prisma.InputJsonValue;

  if (outcome.status === PaymentStatus.SUCCEEDED) {
    const amountMatches =
      outcome.paidAmount === undefined || outcome.paidAmount === payment.amount.toFixed(2);
    const currencyMatches =
      outcome.paidCurrency === undefined || outcome.paidCurrency === payment.currencyCode;

    if (!amountMatches || !currencyMatches) {
      const reason = `Gateway reported ${outcome.paidAmount} ${outcome.paidCurrency}, expected ${payment.amount.toFixed(2)} ${payment.currencyCode}`;
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, failureReason: reason, metadata },
      });
      console.error(`[payment] amount mismatch on ${payment.reference}: ${reason}`);
      return {
        handled: true,
        reference: payment.reference,
        status: PaymentStatus.FAILED,
        reason: "amount mismatch",
      };
    }
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: outcome.status,
      ...(outcome.providerRef ? { providerRef: outcome.providerRef } : {}),
      ...(outcome.status === PaymentStatus.SUCCEEDED ? { paidAt: new Date() } : {}),
      ...(outcome.failureReason ? { failureReason: outcome.failureReason } : {}),
      metadata,
    },
    select: { reference: true, status: true },
  });

  return { handled: true, reference: updated.reference, status: updated.status };
};
