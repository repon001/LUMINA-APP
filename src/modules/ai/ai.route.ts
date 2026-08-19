import { Router } from "express";
import { AiController } from "./ai.controller";
import { authenticate } from "../../middleware/auth";
import { aiLimiter } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import {
  assistantSchema,
  packingListRequestSchema,
  planTripSchema,
  recommendSchema,
} from "./ai.validation";

const router = Router();

// Lets the app hide the AI screens when the server has no provider key.
router.get("/status", AiController.status);

// Signed in, then rate limited per user: these routes cost money per call.
router.use(authenticate, aiLimiter);

router.post("/trip-plan", validate({ body: planTripSchema }), AiController.planTrip);
router.post("/recommendations", validate({ body: recommendSchema }), AiController.recommend);
router.post(
  "/packing-list",
  validate({ body: packingListRequestSchema }),
  AiController.packingList,
);
router.post("/assistant", validate({ body: assistantSchema }), AiController.assist);

export default router;
