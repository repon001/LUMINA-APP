import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role } from "../generated/prisma/client";
import { env } from "../config/env";
import { ApiError } from "./api-error";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export interface IssuedRefreshToken {
  token: string;
  jti: string;
  expiresAt: Date;
}

/** Reads `exp` off a freshly signed token so the DB row and the JWT agree. */
const expiryOf = (token: string): Date => {
  const decoded = jwt.decode(token);
  if (decoded && typeof decoded === "object" && typeof decoded.exp === "number") {
    return new Date(decoded.exp * 1000);
  }
  throw ApiError.internal("Signed token is missing an expiry");
};

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as jwt.SignOptions);

export const signRefreshToken = (userId: string): IssuedRefreshToken => {
  const jti = randomUUID();
  const token = jwt.sign({ sub: userId, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL,
  } as jwt.SignOptions);

  return { token, jti, expiresAt: expiryOf(token) };
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw ApiError.unauthorized("Access token is invalid or expired");
  }
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    throw ApiError.unauthorized("Refresh token is invalid or expired");
  }
};

/**
 * Refresh tokens are stored as a SHA-256 digest. They are high-entropy already,
 * so a fast digest is enough - bcrypt would only add latency to every refresh.
 */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
