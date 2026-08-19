import { Router } from "express";
import { z } from "zod";
import { PaymentController } from "./payment.controller";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idParamSchema } from "../../utils/common.validation";
import { createCheckoutSchema } from "./payment.validation";

const router = Router();

/**
 * Callbacks come from the gateway, not from a signed-in user, so they carry no
 * token. Authenticity is proved by the adapter instead: a Stripe signature over
 * the raw body, or an SSLCommerz validation call made with store credentials.
 */
router.post(
  "/webhook/:provider",
  validate({ params: z.object({ provider: z.string().min(1) }) }),
  PaymentController.webhook,
);

// Development-only stand-in for a hosted checkout page.
router.get("/stub/checkout", PaymentController.stubCheckout);

router.get("/providers", PaymentController.providers);

router.use(authenticate);

router.get("/", PaymentController.list);
router.post("/checkout", validate({ body: createCheckoutSchema }), PaymentController.checkout);
router.get("/:id", validate({ params: idParamSchema }), PaymentController.getOne);

export default router;
