import type { Request, Response } from "express";
import { sendPaginated, sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { param, requireUserId } from "../../utils/request";
import * as userService from "./user.service";
import type { CreateUserInput, UpdateUserInput } from "./user.validation";

export const UserController = {
  list: catchAsync(async (req: Request, res: Response) => {
    const result = await userService.listUsers(req.query as Record<string, unknown>);
    sendPaginated(res, "Users fetched", result);
  }),

  getOne: catchAsync(async (req: Request, res: Response) => {
    const user = await userService.getUserById(param(req, "id"));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "User fetched",
      data: user,
    });
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    const user = await userService.createUser(req.body as CreateUserInput);
    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: "User created",
      data: user,
    });
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const user = await userService.updateUser(
      param(req, "id"),
      req.body as UpdateUserInput,
      requireUserId(req),
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "User updated",
      data: user,
    });
  }),
};
