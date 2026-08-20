import { Router } from "express";
import { z } from "zod";
import { ImageController } from "./image.controller";
import { Role } from "../../generated/prisma/client";
import { authenticate, authorize } from "../../middleware/auth";
import { uploadCatalogueImages } from "../../middleware/upload";
import { validate } from "../../middleware/validate";

const router = Router();

const ownerParams = z.object({
  kind: z.enum(["destination", "place"]),
  id: z.string().min(1),
});

/** Anyone may look at the photographs of anything they can already see. */
router.get("/:kind/:id", validate({ params: ownerParams }), ImageController.list);

// Multipart, so no body validation: multer parses the request and each file is
// checked by type and size as it streams past.
router.post(
  "/:kind/:id",
  authenticate,
  uploadCatalogueImages,
  validate({ params: ownerParams }),
  ImageController.add,
);

// Removing somebody's photograph is a moderator's call.
router.delete(
  "/:imageId",
  authenticate,
  authorize(Role.ADMIN, Role.MODERATOR),
  validate({ params: z.object({ imageId: z.string().min(1) }) }),
  ImageController.remove,
);

export default router;
