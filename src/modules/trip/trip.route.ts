import { Router } from "express";
import { z } from "zod";
import { TripController } from "./trip.controller";
import { authenticate, authenticateOptional } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idParamSchema } from "../../utils/common.validation";
import {
  addStopSchema,
  createTripSchema,
  duplicateTripSchema,
  reorderStopsSchema,
  shareTripSchema,
  updateStopSchema,
  updateTripSchema,
} from "./trip.validation";

const router = Router();

const stopParamsSchema = z.object({
  id: z.string().min(1),
  stopId: z.string().min(1),
});

// Discovery: public itineraries anyone can browse. Before "/:id".
router.get("/public", TripController.listPublic);

// "Anyone with the link": the code is the credential, so no token is needed.
router.get(
  "/shared/:shareCode",
  validate({ params: z.object({ shareCode: z.string().min(1) }) }),
  TripController.getByShareCode,
);

router.get("/", authenticate, TripController.listMine);
router.post("/", authenticate, validate({ body: createTripSchema }), TripController.create);

// Readable by its owner, by an admin, or by anyone when it is public - so the
// token is optional and the service decides.
router.get(
  "/:id",
  authenticateOptional,
  validate({ params: idParamSchema }),
  TripController.getOne,
);

router.patch(
  "/:id",
  authenticate,
  validate({ params: idParamSchema, body: updateTripSchema }),
  TripController.update,
);

router.delete("/:id", authenticate, validate({ params: idParamSchema }), TripController.remove);

// Copying someone else's public itinerary is the point of publishing one, so
// this needs a token to own the copy, but not ownership of the original.
router.post(
  "/:id/duplicate",
  authenticate,
  validate({ params: idParamSchema, body: duplicateTripSchema }),
  TripController.duplicate,
);

router.post(
  "/:id/share",
  authenticate,
  validate({ params: idParamSchema, body: shareTripSchema }),
  TripController.share,
);

router.delete(
  "/:id/share",
  authenticate,
  validate({ params: idParamSchema }),
  TripController.unshare,
);

// ---- route stops (Dhaka -> Tokyo -> Kyoto) ----

router.post(
  "/:id/stops",
  authenticate,
  validate({ params: idParamSchema, body: addStopSchema }),
  TripController.addStop,
);

router.put(
  "/:id/stops/order",
  authenticate,
  validate({ params: idParamSchema, body: reorderStopsSchema }),
  TripController.reorderStops,
);

router.patch(
  "/:id/stops/:stopId",
  authenticate,
  validate({ params: stopParamsSchema, body: updateStopSchema }),
  TripController.updateStop,
);

router.delete(
  "/:id/stops/:stopId",
  authenticate,
  validate({ params: stopParamsSchema }),
  TripController.removeStop,
);

export default router;
