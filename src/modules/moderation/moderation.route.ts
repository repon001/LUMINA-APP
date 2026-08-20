import { Router } from "express";
import { ModerationController } from "./moderation.controller";
import { Role } from "../../generated/prisma/client";
import { authenticate, authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idParamSchema } from "../../utils/common.validation";
import { queueQuerySchema, rejectSchema, submissionKindSchema } from "./moderation.validation";

const router = Router();

router.use(authenticate);

/**
 * Anyone may see their own submissions - that is the whole point of being told
 * something is in review. Declared before the moderator gate below.
 */
router.get("/mine", ModerationController.mine);

// Everything past here is a moderator's job.
router.use(authorize(Role.ADMIN, Role.MODERATOR));

router.get("/queue", validate({ query: queueQuerySchema }), ModerationController.queue);
router.get("/counts", ModerationController.counts);

const decisionParams = idParamSchema.extend({ kind: submissionKindSchema });

router.post(
  "/:kind/:id/approve",
  validate({ params: decisionParams }),
  ModerationController.approve,
);

router.post(
  "/:kind/:id/reject",
  validate({ params: decisionParams, body: rejectSchema }),
  ModerationController.reject,
);

export default router;
