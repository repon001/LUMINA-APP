import type { Request, Response } from "express";
import { sendPaginated, sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { optionalUser, param, requireUser } from "../../utils/request";
import * as destinationService from "./destination.service";
import type {
  CreateDestinationInput,
  NearbyQuery,
  UpdateDestinationInput,
} from "./destination.validation";

export const DestinationController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const result = await destinationService.listDestinations(req.query as Record<string, unknown>);
    sendPaginated(res, "Destinations fetched", result);
  }),

  nearby: catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as NearbyQuery;
    const items = await destinationService.findNearbyDestinations(query);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Nearby destinations fetched",
      data: items,
      meta: { center: { lat: query.lat, lng: query.lng }, radiusKm: query.radiusKm },
    });
  }),

  getOne: catchAsync(async (req: Request, res: Response) => {
    const destination = await destinationService.getDestination(
      param(req, "idOrSlug"),
      optionalUser(req),
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Destination fetched",
      data: destination,
    });
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    const destination = await destinationService.createDestination(
      req.body as CreateDestinationInput,
      requireUser(req),
    );

    sendResponse(res, {
      statusCode: 201,
      success: true,
      // The message is the only signal a contributor gets that their entry is
      // not live yet, so it says so rather than just "created".
      message:
        destination.status === "APPROVED"
          ? "Destination created"
          : "Destination submitted for review",
      data: destination,
    });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const destination = await destinationService.updateDestination(
      param(req, "id"),
      req.body as UpdateDestinationInput,
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Destination updated",
      data: destination,
    });
  }),

  remove: catchAsync(async (req: Request, res: Response) => {
    await destinationService.deleteDestination(param(req, "id"));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Destination deleted",
      data: null,
    });
  }),
};
