import type { Request } from "express";
import type { Role } from "../generated/prisma/client";
import { ApiError } from "./api-error";

/**
 * Reads a route parameter as a string.
 *
 * Express 5 types params as `string | string[]`, so every controller would
 * otherwise repeat the same narrowing cast.
 */
export const param = (req: Request, name: string): string => {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw ApiError.badRequest(`Missing route parameter "${name}"`);
  }
  return value;
};

/** Reads an optional string query parameter, ignoring repeated keys. */
export const queryParam = (req: Request, name: string): string | undefined => {
  const value = req.query[name];
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
};

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

/**
 * The signed-in user. Throws rather than returning undefined, so a controller
 * mounted without `authenticate` fails loudly instead of reading `undefined`.
 */
export const requireUser = (req: Request): AuthenticatedUser => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
};

export const requireUserId = (req: Request): string => requireUser(req).id;
