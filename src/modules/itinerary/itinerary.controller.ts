import type { Request, Response } from "express";
import { sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { param, queryParam, requireUser } from "../../utils/request";
import * as itineraryService from "./itinerary.service";
import type {
  AddDayInput,
  AddItemInput,
  MoveItemInput,
  ReorderDaysInput,
  ReorderItemsInput,
  UpdateDayInput,
  UpdateItemInput,
} from "./itinerary.validation";

const ok = (res: Response, message: string, data: unknown, statusCode = 200) =>
  sendResponse(res, { statusCode, success: true, message, data });

export const ItineraryController = {
  get: catchAsync(async (req: Request, res: Response) => {
    const days = await itineraryService.getItinerary(
      param(req, "tripId"),
      req.user,
      queryParam(req, "shareCode"),
    );
    ok(res, "Itinerary fetched", days);
  }),

  addDay: catchAsync(async (req: Request, res: Response) => {
    const day = await itineraryService.addDay(
      param(req, "tripId"),
      requireUser(req),
      req.body as AddDayInput,
    );
    ok(res, "Day added", day, 201);
  }),

  updateDay: catchAsync(async (req: Request, res: Response) => {
    const day = await itineraryService.updateDay(
      param(req, "tripId"),
      param(req, "dayId"),
      requireUser(req),
      req.body as UpdateDayInput,
    );
    ok(res, "Day updated", day);
  }),

  removeDay: catchAsync(async (req: Request, res: Response) => {
    await itineraryService.removeDay(param(req, "tripId"), param(req, "dayId"), requireUser(req));
    ok(res, "Day removed", null);
  }),

  reorderDays: catchAsync(async (req: Request, res: Response) => {
    const days = await itineraryService.reorderDays(
      param(req, "tripId"),
      requireUser(req),
      req.body as ReorderDaysInput,
    );
    ok(res, "Days reordered", days);
  }),

  addItem: catchAsync(async (req: Request, res: Response) => {
    const item = await itineraryService.addItem(
      param(req, "tripId"),
      param(req, "dayId"),
      requireUser(req),
      req.body as AddItemInput,
    );
    ok(res, "Item added", item, 201);
  }),

  updateItem: catchAsync(async (req: Request, res: Response) => {
    const item = await itineraryService.updateItem(
      param(req, "tripId"),
      param(req, "dayId"),
      param(req, "itemId"),
      requireUser(req),
      req.body as UpdateItemInput,
    );
    ok(res, "Item updated", item);
  }),

  removeItem: catchAsync(async (req: Request, res: Response) => {
    await itineraryService.removeItem(
      param(req, "tripId"),
      param(req, "dayId"),
      param(req, "itemId"),
      requireUser(req),
    );
    ok(res, "Item removed", null);
  }),

  reorderItems: catchAsync(async (req: Request, res: Response) => {
    const items = await itineraryService.reorderItems(
      param(req, "tripId"),
      param(req, "dayId"),
      requireUser(req),
      req.body as ReorderItemsInput,
    );
    ok(res, "Items reordered", items);
  }),

  moveItem: catchAsync(async (req: Request, res: Response) => {
    const item = await itineraryService.moveItem(
      param(req, "tripId"),
      param(req, "dayId"),
      param(req, "itemId"),
      requireUser(req),
      req.body as MoveItemInput,
    );
    ok(res, "Item moved", item);
  }),
};
