import type { RequestHandler } from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { randomUUID } from "node:crypto";

import { cloudinary, isMediaConfigured } from "../config/cloudinary";
import { env } from "../config/env";
import { ApiError } from "../utils/api-error";

/** What a browser or a phone will actually produce for a photograph. */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Uploads go straight to Cloudinary, never to our disk.
 *
 * The storage engine streams the request body onwards as it arrives, so the API
 * never holds a file - which is what makes this safe to run on a host with a
 * read-only or ephemeral filesystem.
 */
const storageFor = (folder: string, transformation: Record<string, unknown>[]) =>
  new CloudinaryStorage({
    cloudinary,
    params: () => ({
      folder,
      // A fresh id per upload, so a replaced file gets a genuinely new URL
      // rather than a cached copy of the old one. The file it replaces is
      // deleted by the service once the database has been updated.
      public_id: randomUUID(),
      transformation,
      format: "webp",
    }),
  });

/** Square and face-aware: an avatar is shown at 96px, not full bleed. */
const avatarStorage = storageFor(env.CLOUDINARY_FOLDER, [
  { width: 512, height: 512, crop: "fill", gravity: "face" },
]);

/** Wide enough for a hero, but not a 12 megapixel phone original. */
const catalogueStorage = storageFor(env.CLOUDINARY_IMAGE_FOLDER, [
  { width: 1600, height: 1067, crop: "limit" },
]);

const imageFilter: multer.Options["fileFilter"] = (_req, file, callback) => {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    callback(ApiError.badRequest("Upload a JPEG, PNG or WebP image"));
    return;
  }

  callback(null, true);
};

/**
 * Multer reports its own failures with codes rather than status, so they are
 * translated here - otherwise a file that is merely too large surfaces as a
 * 500, which reads as our fault rather than a fixable mistake.
 */
const guard =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    if (!isMediaConfigured) {
      next(ApiError.serviceUnavailable("Image uploads are not configured on this server"));
      return;
    }

    handler(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          const mb = Math.round(env.AVATAR_MAX_BYTES / (1024 * 1024));
          next(ApiError.badRequest(`That image is too large. The limit is ${mb} MB`));
          return;
        }

        next(ApiError.badRequest(error.message));
        return;
      }

      next(error);
    });
  };

/** One image, in a field named `avatar`. */
export const uploadAvatar = guard(
  multer({
    storage: avatarStorage,
    limits: { fileSize: env.AVATAR_MAX_BYTES, files: 1 },
    fileFilter: imageFilter,
  }).single("avatar"),
);

/** Up to a handful of photographs, in a field named `images`. */
export const uploadCatalogueImages = guard(
  multer({
    storage: catalogueStorage,
    limits: { fileSize: env.AVATAR_MAX_BYTES, files: env.MAX_IMAGES_PER_UPLOAD },
    fileFilter: imageFilter,
  }).array("images", env.MAX_IMAGES_PER_UPLOAD),
);
