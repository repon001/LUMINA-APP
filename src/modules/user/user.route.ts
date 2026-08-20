import { Router } from "express";
import { UserController } from "./user.controller";
import { Role } from "../../generated/prisma/client";
import { authenticate, authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idParamSchema } from "../../utils/common.validation";
import { uploadAvatar } from "../../middleware/upload";
import { createUserSchema, updateProfileSchema, updateUserSchema } from "./user.validation";

const router = Router();

router.use(authenticate);

// Your own account. Declared before "/:id", or "me" is read as a user id - and
// these are the only user routes that are not an admin job.
router.patch("/me", validate({ body: updateProfileSchema }), UserController.updateMe);

// Multipart, so no body validation here: multer parses the request, and the
// image is checked by type and size as it streams past.
router.post("/me/avatar", uploadAvatar, UserController.setAvatar);
router.delete("/me/avatar", UserController.removeAvatar);

router.get("/", authorize(Role.ADMIN, Role.MODERATOR), UserController.list);

router.post(
  "/",
  authorize(Role.ADMIN),
  validate({ body: createUserSchema }),
  UserController.create,
);

router.get(
  "/:id",
  authorize(Role.ADMIN, Role.MODERATOR),
  validate({ params: idParamSchema }),
  UserController.getOne,
);

router.patch(
  "/:id",
  authorize(Role.ADMIN),
  validate({ params: idParamSchema, body: updateUserSchema }),
  UserController.update,
);

export default router;
