import type { NextFunction, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
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

/**
 * Applied to the AI routes.
 *
 * Every call here costs real money at the provider, so the budget is per
 * signed-in user rather than per IP - a shared office network should not share
 * one quota, and an unauthenticated caller never reaches these routes.
 */
export const aiLimiter = rateLimit({
  windowMs,
  limit: env.AI_RATE_REQUEST_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ""),
  handler: rejectWith429,
});

/**
 * Applied to catalogue submissions.
 *
 * Keyed per user like the AI routes, because every submission becomes work for
 * a human moderator. The budget is generous enough for someone adding the
 * places they visited on a trip, and tight enough that a script cannot bury the
 * queue faster than anyone can read it.
 */
export const submissionLimiter = rateLimit({
  windowMs,
  limit: env.SUBMISSION_RATE_REQUEST_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ""),
  handler: rejectWith429,
});
