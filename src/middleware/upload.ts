import type { RequestHandler } from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { randomUUID } from "node:crypto";

import { cloudinary, isMediaConfigured } from "../config/cloudinary";
import { env } from "../config/env";
import { ApiError } from "../utils/api-error";

/** What a browser or phone will actually produce for a photograph. */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Avatars go straight to Cloudinary, never to our disk.
 *
 * The storage engine streams the request body onwards as it arrives, so the API
 * never holds a file - which is what makes this safe to run on a host with a
 * read-only or ephemeral filesystem.
 */
const storage = new CloudinaryStorage({
  cloudinary,
  params: () => ({
    folder: env.CLOUDINARY_FOLDER,
    // A fresh id per upload, so a replaced avatar gets a genuinely new URL
    // instead of a cached copy of the old one. The previous file is deleted by
    // the service once the database has been updated.
    public_id: randomUUID(),
    // Square, face-aware and modest: an avatar is displayed at 96px, and there
    // is no reason to serve a 12 megapixel photograph to do it.
    transformation: [{ width: 512, height: 512, crop: "fill", gravity: "face" }],
    format: "webp",
  }),
});

const handler = multer({
  storage,
  limits: { fileSize: env.AVATAR_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      callback(ApiError.badRequest("Upload a JPEG, PNG or WebP image"));
      return;
    }
    callback(null, true);
  },
}).single("avatar");

/**
 * Accepts one image field named `avatar`.
 *
 * Multer reports its own failures with codes rather than status, so they are
 * translated here - otherwise a file that is merely too large surfaces as a
 * 500, which reads as our fault rather than a fixable mistake.
 */
export const uploadAvatar: RequestHandler = (req, res, next) => {
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
