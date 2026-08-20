import type { Request, Response } from "express";
import { sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { ApiError } from "../../utils/api-error";
import { param, requireUser } from "../../utils/request";
import { Role } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import * as imageService from "./image.service";

/**
 * Only the person who submitted an entry, or a moderator, may add pictures to
 * it - otherwise anyone could hang their own photographs off somebody else's
 * restaurant.
 */
const requireOwnership = async (
  kind: "destination" | "place",
  id: string,
  user: { id: string; role: Role },
) => {
  const row =
    kind === "destination"
      ? await prisma.destination.findUnique({ where: { id }, select: { submittedById: true } })
      : await prisma.place.findUnique({ where: { id }, select: { submittedById: true } });

  if (!row)
    throw ApiError.notFound(`${kind === "destination" ? "Destination" : "Place"} not found`);

  const moderator = user.role === Role.ADMIN || user.role === Role.MODERATOR;
  if (!moderator && row.submittedById !== user.id) {
    throw ApiError.forbidden("You can only add photographs to your own submissions");
  }
};

export const ImageController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const kind = param(req, "kind") as "destination" | "place";
    const owner =
      kind === "destination" ? { destinationId: param(req, "id") } : { placeId: param(req, "id") };

    const images = await imageService.listImages(owner);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Images fetched",
      data: images,
    });
  }),

  add: catchAsync(async (req: Request, res: Response) => {
    const kind = param(req, "kind") as "destination" | "place";
    const id = param(req, "id");
    const user = requireUser(req);

    await requireOwnership(kind, id, user);

    // Multer has already streamed them to Cloudinary; `path` is the delivered
    // URL and `filename` is the handle used to delete it.
    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) throw ApiError.badRequest("Attach at least one image");

    const owner = kind === "destination" ? { destinationId: id } : { placeId: id };
    const images = await imageService.addImages(
      owner,
      files.map((file) => ({ url: file.path, publicId: file.filename })),
      user.id,
    );

    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: files.length === 1 ? "Photograph added" : "Photographs added",
      data: images,
    });
  }),

  remove: catchAsync(async (req: Request, res: Response) => {
    await imageService.removeImage(param(req, "imageId"));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Photograph removed",
      data: null,
    });
  }),
};
