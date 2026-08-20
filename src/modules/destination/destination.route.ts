import { Router } from "express";
import { z } from "zod";
import { DestinationController } from "./destination.controller";
import { Role } from "../../generated/prisma/client";
import { authenticate, authenticateOptional, authorize } from "../../middleware/auth";
import { submissionLimiter } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { idParamSchema } from "../../utils/common.validation";
import {
  createDestinationSchema,
  nearbyQuerySchema,
  updateDestinationSchema,
} from "./destination.validation";

const router = Router();

// Browsing is public: the app shows destinations before anyone signs in.
router.get("/", DestinationController.list);

// Must be declared before "/:idOrSlug", or "nearby" is read as a slug.
router.get("/nearby", validate({ query: nearbyQuerySchema }), DestinationController.nearby);

// Optional auth: anyone may read an approved destination, and a token only
// changes whether your own submission is visible while it waits for review.
router.get(
  "/:idOrSlug",
  authenticateOptional,
  validate({ params: z.object({ idOrSlug: z.string().min(1) }) }),
  DestinationController.getOne,
);

// Anyone signed in may propose a destination. It is held for review unless a
// moderator submitted it - see moderation.access.ts.
router.post(
  "/",
  authenticate,
  submissionLimiter,
  validate({ body: createDestinationSchema }),
  DestinationController.create,
);

router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate({ params: idParamSchema, body: updateDestinationSchema }),
  DestinationController.update,
);

router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate({ params: idParamSchema }),
  DestinationController.remove,
);

export default router;
