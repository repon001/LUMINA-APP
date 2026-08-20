import type { Request, Response } from "express";
import { sendPaginated, sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { param, requireUser, requireUserId } from "../../utils/request";
import * as moderationService from "./moderation.service";
import type { QueueQuery, RejectInput, SubmissionKind } from "./moderation.validation";

/** "destination" | "place", already narrowed by the route's param schema. */
const kindOf = (req: Request): SubmissionKind => param(req, "kind") as SubmissionKind;

export const ModerationController = {
  queue: catchAsync(async (req: Request, res: Response) => {
    const result = await moderationService.listQueue(req.query as unknown as QueueQuery);
    sendPaginated(res, "Submissions fetched", result);
  }),

  counts: catchAsync(async (_req: Request, res: Response) => {
    const counts = await moderationService.queueCounts();
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Queue counts fetched",
      data: counts,
    });
  }),

  approve: catchAsync(async (req: Request, res: Response) => {
    const item = await moderationService.approve(kindOf(req), param(req, "id"), requireUser(req));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Submission approved",
      data: item,
    });
  }),

  reject: catchAsync(async (req: Request, res: Response) => {
    const { note } = req.body as RejectInput;
    const item = await moderationService.reject(
      kindOf(req),
      param(req, "id"),
      requireUser(req),
      note,
    );

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Submission rejected",
      data: item,
    });
  }),

  mine: catchAsync(async (req: Request, res: Response) => {
    const submissions = await moderationService.listMySubmissions(requireUserId(req));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Your submissions fetched",
      data: submissions,
    });
  }),
};
