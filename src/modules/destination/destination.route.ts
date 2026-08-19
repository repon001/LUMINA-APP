import { Router } from "express";
import { z } from "zod";
import { DestinationController } from "./destination.controller";
import { Role } from "../../generated/prisma/client";
import { authenticate, authorize } from "../../middleware/auth";
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

router.get(
  "/:idOrSlug",
  validate({ params: z.object({ idOrSlug: z.string().min(1) }) }),
  DestinationController.getOne,
);

// The catalogue is curated, so writing to it is an admin job.
router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN),
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
