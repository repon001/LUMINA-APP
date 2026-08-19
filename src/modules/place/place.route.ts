import { Router } from "express";
import { PlaceController } from "./place.controller";
import { Role } from "../../generated/prisma/client";
import { authenticate, authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idParamSchema } from "../../utils/common.validation";
import { createPlaceSchema, nearbyPlacesQuerySchema, updatePlaceSchema } from "./place.validation";

const router = Router();

router.get("/", PlaceController.list);

// Before "/:id", or "nearby" is read as an id.
router.get("/nearby", validate({ query: nearbyPlacesQuerySchema }), PlaceController.nearby);

router.get("/:id", validate({ params: idParamSchema }), PlaceController.getOne);

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN),
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
