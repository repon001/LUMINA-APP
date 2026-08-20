import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

/**
 * Cloudinary, configured once.
 *
 * Credentials are optional so the API still boots without them - see
 * `isMediaConfigured`, which the upload route checks before accepting a file.
 */
export const isMediaConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

if (isMediaConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Remove a file we previously uploaded.
 *
 * Never throws: an avatar that was replaced successfully should not fail the
 * request because the old one could not be tidied away.
 */
export const destroyUpload = async (publicId: string | null | undefined) => {
  if (!publicId || !isMediaConfigured) return;

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.warn(`Could not delete Cloudinary asset ${publicId}:`, error);
  }
};

export { cloudinary };
