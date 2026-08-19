import type { NextFunction, Request, Response } from "express";
import type { Role } from "../generated/prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/api-error";
import { verifyAccessToken } from "../utils/jwt";

const bearerToken = (header: string | undefined): string | undefined => {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
};

/**
 * Verifies the access token and confirms the account is still active.
 *
 * The extra lookup costs one indexed read per request, but it means
 * deactivating a user takes effect immediately instead of whenever their
 * access token happens to expire.
 */
export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) {
    next(ApiError.unauthorized("Missing bearer token"));
    return;
  }

  const payload = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    next(ApiError.unauthorized("Account is inactive or no longer exists"));
    return;
  }

  req.user = { id: user.id, email: user.email, role: user.role };
  next();
};

/** Restricts a route to the given roles. Must run after `authenticate`. */
export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden(`Requires one of: ${roles.join(", ")}`));
      return;
    }
    next();
  };
