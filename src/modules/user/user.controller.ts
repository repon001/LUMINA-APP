import type { Request, Response } from "express";
import { sendPaginated, sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import { param, requireUserId } from "../../utils/request";
import { ApiError } from "../../utils/api-error";
import * as userService from "./user.service";
import type { CreateUserInput, UpdateProfileInput, UpdateUserInput } from "./user.validation";

export const UserController = {
  updateMe: catchAsync(async (req: Request, res: Response) => {
    const user = await userService.updateMyProfile(
      requireUserId(req),
      req.body as UpdateProfileInput,
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Profile updated",
      data: user,
    });
  }),

  setAvatar: catchAsync(async (req: Request, res: Response) => {
    // Multer has already streamed the file to Cloudinary by this point; `path`
    // is the delivered URL and `filename` is the handle used to delete it.
    const file = req.file;
    if (!file) throw ApiError.badRequest("Attach an image in the `avatar` field");

    const user = await userService.setMyAvatar(requireUserId(req), {
      url: file.path,
      publicId: file.filename,
    });

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Avatar updated",
      data: user,
    });
  }),

  removeAvatar: catchAsync(async (req: Request, res: Response) => {
    const user = await userService.removeMyAvatar(requireUserId(req));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Avatar removed",
      data: user,
    });
  }),

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
