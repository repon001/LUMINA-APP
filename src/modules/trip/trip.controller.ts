import type { Request, Response } from "express";
import { sendPaginated, sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { param, queryParam, requireUser, requireUserId } from "../../utils/request";
import * as tripService from "./trip.service";
import type {
  AddStopInput,
  CreateTripInput,
  DuplicateTripInput,
  ReorderStopsInput,
  ShareTripInput,
  UpdateStopInput,
  UpdateTripInput,
} from "./trip.validation";

/** An unlisted trip can also be opened with `?shareCode=…` on any read route. */
const shareCodeOf = (req: Request) => queryParam(req, "shareCode");

export const TripController = {
  listMine: catchAsync(async (req: Request, res: Response) => {
    const result = await tripService.listMyTrips(
      requireUserId(req),
      req.query as Record<string, unknown>,
    );
    sendPaginated(res, "Trips fetched", result);
  }),

  listPublic: catchAsync(async (req: Request, res: Response) => {
    const result = await tripService.listPublicTrips(req.query as Record<string, unknown>);
    sendPaginated(res, "Public trips fetched", result);
  }),

  getOne: catchAsync(async (req: Request, res: Response) => {
    const trip = await tripService.getTrip(param(req, "id"), req.user, shareCodeOf(req));
    sendResponse(res, { statusCode: 200, success: true, message: "Trip fetched", data: trip });
  }),

  getByShareCode: catchAsync(async (req: Request, res: Response) => {
    const trip = await tripService.getTripByShareCode(param(req, "shareCode"));
    sendResponse(res, { statusCode: 200, success: true, message: "Trip fetched", data: trip });
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    const trip = await tripService.createTrip(requireUserId(req), req.body as CreateTripInput);
    sendResponse(res, { statusCode: 201, success: true, message: "Trip created", data: trip });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const trip = await tripService.updateTrip(
      param(req, "id"),
      requireUser(req),
      req.body as UpdateTripInput,
    );
    sendResponse(res, { statusCode: 200, success: true, message: "Trip updated", data: trip });
  }),

  remove: catchAsync(async (req: Request, res: Response) => {
    await tripService.deleteTrip(param(req, "id"), requireUser(req));
    sendResponse(res, { statusCode: 200, success: true, message: "Trip deleted", data: null });
  }),

  duplicate: catchAsync(async (req: Request, res: Response) => {
    const trip = await tripService.duplicateTrip(
      param(req, "id"),
      requireUser(req),
      req.body as DuplicateTripInput,
      shareCodeOf(req),
    );
    sendResponse(res, { statusCode: 201, success: true, message: "Trip duplicated", data: trip });
  }),

  share: catchAsync(async (req: Request, res: Response) => {
    const result = await tripService.shareTrip(
      param(req, "id"),
      requireUser(req),
      req.body as ShareTripInput,
    );
    sendResponse(res, { statusCode: 200, success: true, message: "Trip shared", data: result });
  }),

  unshare: catchAsync(async (req: Request, res: Response) => {
    const result = await tripService.unshareTrip(param(req, "id"), requireUser(req));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Trip is private again",
      data: result,
    });
  }),

  addStop: catchAsync(async (req: Request, res: Response) => {
    const stop = await tripService.addStop(
      param(req, "id"),
      requireUser(req),
      req.body as AddStopInput,
    );
    sendResponse(res, { statusCode: 201, success: true, message: "Stop added", data: stop });
  }),

  updateStop: catchAsync(async (req: Request, res: Response) => {
    const stop = await tripService.updateStop(
      param(req, "id"),
      param(req, "stopId"),
      requireUser(req),
      req.body as UpdateStopInput,
    );
    sendResponse(res, { statusCode: 200, success: true, message: "Stop updated", data: stop });
  }),

  removeStop: catchAsync(async (req: Request, res: Response) => {
    await tripService.removeStop(param(req, "id"), param(req, "stopId"), requireUser(req));
    sendResponse(res, { statusCode: 200, success: true, message: "Stop removed", data: null });
  }),

  reorderStops: catchAsync(async (req: Request, res: Response) => {
    const stops = await tripService.reorderStops(
      param(req, "id"),
      requireUser(req),
      req.body as ReorderStopsInput,
    );
    sendResponse(res, { statusCode: 200, success: true, message: "Route reordered", data: stops });
  }),
};
