import type { Request, Response } from "express";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { sendResponse } from "../../utils/api-response";
import { catchAsync } from "../../utils/catch-async";
import type { IssuedRefreshToken } from "../../utils/jwt";
import { requireUserId } from "../../utils/request";
import * as authService from "./auth.service";
import type { RegisterInput } from "./auth.validation";

const REFRESH_COOKIE = "refresh_token";

const setRefreshCookie = (res: Response, token: IssuedRefreshToken) => {
  res.cookie(REFRESH_COOKIE, token.token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "strict",
    expires: token.expiresAt,
    path: "/api/auth",
  });
};

/**
 * Browsers send the refresh token as an HTTP-only cookie. Native mobile
 * clients, which have no cookie jar to rely on, may send it in the body
 * instead.
 */
const readRefreshToken = (req: Request): string | undefined => {
  const fromCookie = req.cookies?.[REFRESH_COOKIE];
  if (typeof fromCookie === "string" && fromCookie) return fromCookie;

  const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof fromBody === "string" && fromBody ? fromBody : undefined;
};

export const AuthController = {
  register: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.register(req.body as RegisterInput);

    setRefreshCookie(res, result.refreshToken);
    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: "Account created",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken.token,
      },
    });
  }),

  login: catchAsync(async (req: Request, res: Response) => {
    const { email, password } = req.body as { email: string; password: string };
    const result = await authService.login(email, password);

    setRefreshCookie(res, result.refreshToken);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Signed in",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        // Returned for native clients; browsers should use the cookie.
        refreshToken: result.refreshToken.token,
      },
    });
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    const presented = readRefreshToken(req);
    if (!presented) throw ApiError.unauthorized("Missing refresh token");

    const result = await authService.refresh(presented);

    setRefreshCookie(res, result.refreshToken);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Token refreshed",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken.token,
      },
    });
  }),

  logout: catchAsync(async (req: Request, res: Response) => {
    await authService.logout(readRefreshToken(req));
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Signed out",
      data: null,
    });
  }),

  me: catchAsync(async (req: Request, res: Response) => {
    const user = await authService.getCurrentUser(requireUserId(req));
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Current user fetched",
      data: user,
    });
  }),
};
