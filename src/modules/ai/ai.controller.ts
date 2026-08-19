import type { Request, Response } from "express";
import { env } from "../../config/env";
import { sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { requireUser } from "../../utils/request";
import { isAiConfigured } from "./ai.provider";
import * as aiService from "./ai.service";
import type {
  AssistantInput,
  PackingListInput,
  PlanTripInput,
  RecommendInput,
} from "./ai.validation";

/**
 * Every AI response carries what it cost and which model answered.
 *
 * The client ignores it; an operator watching a bill does not. It is the
 * cheapest possible observability for a feature that spends money per request.
 */
const send = (
  res: Response,
  message: string,
  result: { data: unknown; usage: unknown; model: string },
  extra: Record<string, unknown> = {},
) =>
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message,
    data: result.data,
    meta: { model: result.model, usage: result.usage, ...extra },
  });

export const AiController = {
  status: catchAsync(async (_req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "AI status fetched",
      data: {
        available: isAiConfigured(),
        model: isAiConfigured() ? env.OPENROUTER_MODEL : null,
      },
    });
  }),

  planTrip: catchAsync(async (req: Request, res: Response) => {
    const input = req.body as PlanTripInput;
    const result = await aiService.planTrip(requireUser(req), input);

    send(
      res,
      result.appliedTo ? "Itinerary generated and applied" : "Itinerary generated",
      result,
      result.appliedTo ? { appliedTo: result.appliedTo } : {},
    );
  }),

  recommend: catchAsync(async (req: Request, res: Response) => {
    const result = await aiService.recommend(req.body as RecommendInput);
    send(res, "Recommendations generated", result);
  }),

  packingList: catchAsync(async (req: Request, res: Response) => {
    const result = await aiService.packingList(req.body as PackingListInput);
    send(res, "Packing list generated", result);
  }),

  assist: catchAsync(async (req: Request, res: Response) => {
    const result = await aiService.assist(requireUser(req), req.body as AssistantInput);
    send(res, "Assistant replied", result);
  }),
};
