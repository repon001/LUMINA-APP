import { Router } from "express";
import { PlaceController } from "./place.controller";
import { Role } from "../../generated/prisma/client";
import { authenticate, authenticateOptional, authorize } from "../../middleware/auth";
import { submissionLimiter } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { idParamSchema } from "../../utils/common.validation";
import { createPlaceSchema, nearbyPlacesQuerySchema, updatePlaceSchema } from "./place.validation";

const router = Router();

router.get("/", PlaceController.list);

// Before "/:id", or "nearby" is read as an id.
router.get("/nearby", validate({ query: nearbyPlacesQuerySchema }), PlaceController.nearby);

// Optional auth: a token only changes whether your own submission is visible
// while it waits for review.
router.get(
  "/:id",
  authenticateOptional,
  validate({ params: idParamSchema }),
  PlaceController.getOne,
);

// Anyone signed in may propose a place inside a destination. It is held for
// review unless a moderator submitted it - see moderation.access.ts.
router.post(
  "/",
  authenticate,
  submissionLimiter,
  validate({ body: createPlaceSchema }),
  PlaceController.create,
);

router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate({ params: idParamSchema, body: updatePlaceSchema }),
  PlaceController.update,
);

router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate({ params: idParamSchema }),
  PlaceController.remove,
);

export default router;
