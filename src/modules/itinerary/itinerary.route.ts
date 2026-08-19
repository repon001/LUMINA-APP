import { Router } from "express";
import { z } from "zod";
import { ItineraryController } from "./itinerary.controller";
import { authenticate, authenticateOptional } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import {
  addDaySchema,
  addItemSchema,
  moveItemSchema,
  reorderDaysSchema,
  reorderItemsSchema,
  updateDaySchema,
  updateItemSchema,
} from "./itinerary.validation";

/**
 * Mounted at `/trips/:tripId/days`, so `mergeParams` is what lets these handlers
 * still see `tripId`.
 */
const router = Router({ mergeParams: true });

const tripParams = z.object({ tripId: z.string().min(1) });
const dayParams = tripParams.extend({ dayId: z.string().min(1) });
const itemParams = dayParams.extend({ itemId: z.string().min(1) });

// Readable by anyone who may read the trip, including through a share link.
router.get("/", authenticateOptional, validate({ params: tripParams }), ItineraryController.get);

router.post(
  "/",
  authenticate,
  validate({ params: tripParams, body: addDaySchema }),
  ItineraryController.addDay,
);

// Before "/:dayId", or "order" is read as a day id.
router.put(
  "/order",
  authenticate,
  validate({ params: tripParams, body: reorderDaysSchema }),
  ItineraryController.reorderDays,
);

router.patch(
  "/:dayId",
  authenticate,
  validate({ params: dayParams, body: updateDaySchema }),
  ItineraryController.updateDay,
);

router.delete(
  "/:dayId",
  authenticate,
  validate({ params: dayParams }),
  ItineraryController.removeDay,
);

router.post(
  "/:dayId/items",
  authenticate,
  validate({ params: dayParams, body: addItemSchema }),
  ItineraryController.addItem,
);

router.put(
  "/:dayId/items/order",
  authenticate,
  validate({ params: dayParams, body: reorderItemsSchema }),
  ItineraryController.reorderItems,
);

router.post(
  "/:dayId/items/:itemId/move",
  authenticate,
  validate({ params: itemParams, body: moveItemSchema }),
  ItineraryController.moveItem,
);

router.patch(
  "/:dayId/items/:itemId",
  authenticate,
  validate({ params: itemParams, body: updateItemSchema }),
  ItineraryController.updateItem,
);

router.delete(
  "/:dayId/items/:itemId",
  authenticate,
  validate({ params: itemParams }),
  ItineraryController.removeItem,
);

export default router;
