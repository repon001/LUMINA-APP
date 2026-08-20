import { prisma } from "../../config/prisma";
import { destroyUpload } from "../../config/cloudinary";
import { ApiError } from "../../utils/api-error";
import { findImageFor } from "./image.provider";

/** How many photographs one entry may carry. */
export const MAX_IMAGES = 8;

const IMAGE_SELECT = {
  id: true,
  url: true,
  position: true,
  uploadedById: true,
  createdAt: true,
} as const;

/** Which parent an image hangs off. Exactly one of these is ever set. */
type Owner = { destinationId: string } | { placeId: string };

export const listImages = (owner: Owner) =>
  prisma.catalogueImage.findMany({
    where: owner,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: IMAGE_SELECT,
  });

/**
 * Attach uploaded files to a city or a place.
 *
 * Position continues from whatever is already there, so a second upload appends
 * rather than fighting the first for the top slot.
 */
export const addImages = async (
  owner: Owner,
  files: { url: string; publicId: string }[],
  uploadedById: string,
) => {
  const existing = await prisma.catalogueImage.count({ where: owner });

  if (existing + files.length > MAX_IMAGES) {
    throw ApiError.badRequest(`That would be more than ${MAX_IMAGES} photographs`);
  }

  await prisma.catalogueImage.createMany({
    data: files.map((file, index) => ({
      ...owner,
      url: file.url,
      publicId: file.publicId,
      uploadedById,
      position: existing + index,
    })),
  });

  return listImages(owner);
};

export const removeImage = async (id: string) => {
  const image = await prisma.catalogueImage.findUnique({
    where: { id },
    select: { id: true, publicId: true },
  });

  if (!image) throw ApiError.notFound("Image not found");

  await prisma.catalogueImage.delete({ where: { id } });
  await destroyUpload(image.publicId);
};

/**
 * Give a new entry a photograph when its author did not.
 *
 * Runs after the row exists and never throws: an entry with no picture is worth
 * far more than a submission lost because an image service was slow.
 */
export const attachAutoImage = async (
  owner: Owner,
  query: string,
  fallbackKey: string,
): Promise<void> => {
  try {
    const existing = await prisma.catalogueImage.count({ where: owner });
    if (existing > 0) return;

    const found = await findImageFor(query, fallbackKey);

    await prisma.catalogueImage.create({
      data: {
        ...owner,
        url: found.url,
        // Not ours, so there is nothing to delete from Cloudinary later.
        publicId: null,
        uploadedById: null,
        position: 0,
      },
    });
  } catch (error) {
    console.warn("Could not attach an automatic image:", error);
  }
};
