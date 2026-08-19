import { Router } from "express";
import { UserController } from "./user.controller";
import { Role } from "../../generated/prisma/client";
import { authenticate, authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idParamSchema } from "../../utils/common.validation";
import { createUserSchema, updateUserSchema } from "./user.validation";

const router = Router();

router.use(authenticate);

router.get("/", authorize(Role.ADMIN, Role.MANAGER), UserController.list);

router.post(
  "/",
  authorize(Role.ADMIN),
  validate({ body: createUserSchema }),
  UserController.create,
);

router.get(
  "/:id",
  authorize(Role.ADMIN, Role.MANAGER),
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
