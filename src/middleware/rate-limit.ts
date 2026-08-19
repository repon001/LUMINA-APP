import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { ApiError } from "../utils/api-error";

// The library default reply is plain text, which would be the only response in
// the API not using the shared envelope. Route it through the error handler.
const rejectWith429 = (_req: Request, _res: Response, next: NextFunction) => {
  next(ApiError.tooManyRequests());
};

const windowMs = env.RATE_TIME_LIMIT * 60 * 1000;

/** Applied to every request. Generous - it is a backstop, not a policy. */
export const globalLimiter = rateLimit({
  windowMs,
  limit: env.RATE_REQUEST_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Liveness probes would otherwise consume a client whole quota.
  skip: (req) => req.path.startsWith("/health"),
  handler: rejectWith429,
});

/**
 * Applied to the credential-taking auth routes.
 *
 * `skipSuccessfulRequests` means a normal user signing in and out repeatedly is
 * never blocked, while someone guessing passwords burns the budget in ten
 * attempts.
 */
export const authLimiter = rateLimit({
  windowMs,
  limit: env.AUTH_RATE_REQUEST_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rejectWith429,
});
