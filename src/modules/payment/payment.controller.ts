import type { Request, Response } from "express";
import { PaymentProvider } from "../../generated/prisma/client";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { sendPaginated, sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { param, requireUser, requireUserId } from "../../utils/request";
import { availableProviders } from "./payment.gateways";
import * as paymentService from "./payment.service";
import type { CreateCheckoutInput } from "./payment.validation";

/** The webhook body arrives raw for Stripe; Express parses the rest. */
const callbackInput = (req: Request) => ({
  rawBody: Buffer.isBuffer(req.body) ? (req.body as Buffer) : undefined,
  body: Buffer.isBuffer(req.body) ? undefined : req.body,
  headers: req.headers,
});

export const PaymentController = {
  providers: catchAsync(async (_req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Available payment providers fetched",
      data: { providers: availableProviders() },
    });
  }),

  list: catchAsync(async (req: Request, res: Response) => {
    const result = await paymentService.listMyPayments(
      requireUserId(req),
      req.query as Record<string, unknown>,
    );
    sendPaginated(res, "Payments fetched", result);
  }),

  getOne: catchAsync(async (req: Request, res: Response) => {
    const payment = await paymentService.getPayment(param(req, "id"), requireUser(req));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Payment fetched",
      data: payment,
    });
  }),

  checkout: catchAsync(async (req: Request, res: Response) => {
    const payment = await paymentService.startCheckout(
      requireUser(req),
      req.body as CreateCheckoutInput,
    );
    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: "Checkout created",
      data: payment,
    });
  }),

  /**
   * One handler for every gateway: the provider is in the path, and the adapter
   * behind it decides what the callback means.
   *
   * Always answers 200 once the callback is authentic. A gateway reads a non-2xx
   * as "try again later", so reporting "this reference is unknown" as an error
   * would buy an endless retry loop for a payment that can never match.
   */
  webhook: catchAsync(async (req: Request, res: Response) => {
    const raw = param(req, "provider").toUpperCase();
    if (!(raw in PaymentProvider)) throw ApiError.notFound("Unknown payment provider");

    const result = await paymentService.settlePayment(raw as PaymentProvider, callbackInput(req));

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: result.handled ? "Callback processed" : "Callback ignored",
      data: result,
    });
  }),

  /**
   * Stands in for a gateway's hosted page during development: it shows what
   * would be charged and posts the outcome to the real webhook.
   */
  stubCheckout: catchAsync(async (req: Request, res: Response) => {
    if (env.isProduction || !env.PAYMENT_ALLOW_STUB) throw ApiError.notFound();

    const reference = String(req.query["reference"] ?? "");
    const amount = String(req.query["amount"] ?? "");
    const currency = String(req.query["currency"] ?? "");
    const webhook = `${env.PUBLIC_BASE_URL}/api/payments/webhook/stub`;

    res.type("html").send(`<!doctype html>
<title>Stub checkout</title>
<h1>Stub gateway</h1>
<p>Reference <code>${reference}</code> — ${amount} ${currency}</p>
<form method="post" action="${webhook}">
  <input type="hidden" name="reference" value="${reference}">
  <input type="hidden" name="amount" value="${amount}">
  <input type="hidden" name="currency" value="${currency}">
  <button name="outcome" value="success">Pay</button>
  <button name="outcome" value="fail">Decline</button>
</form>`);
  }),
};
