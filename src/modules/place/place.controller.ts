import type { Request, Response } from "express";
import { sendPaginated, sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { param } from "../../utils/request";
import * as placeService from "./place.service";
import type { CreatePlaceInput, NearbyPlacesQuery, UpdatePlaceInput } from "./place.validation";

export const PlaceController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const result = await placeService.listPlaces(req.query as Record<string, unknown>);
    sendPaginated(res, "Places fetched", result);
  }),

  nearby: catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as NearbyPlacesQuery;
    const items = await placeService.findNearbyPlaces(query);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Nearby places fetched",
      data: items,
      meta: {
        center: { lat: query.lat, lng: query.lng },
        radiusKm: query.radiusKm,
        ...(query.category ? { category: query.category } : {}),
      },
    });
  }),

  getOne: catchAsync(async (req: Request, res: Response) => {
    const place = await placeService.getPlace(param(req, "id"));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Place fetched",
      data: place,
    });
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    const place = await placeService.createPlace(req.body as CreatePlaceInput);
    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: "Place created",
      data: place,
    });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const place = await placeService.updatePlace(param(req, "id"), req.body as UpdatePlaceInput);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Place updated",
      data: place,
    });
  }),

  remove: catchAsync(async (req: Request, res: Response) => {
    await placeService.deletePlace(param(req, "id"));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Place deleted",
      data: null,
    });
  }),
};
