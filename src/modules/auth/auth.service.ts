import { Role } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/api-error";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type IssuedRefreshToken,
} from "../../utils/jwt";
import { hashPassword, verifyPassword } from "../../utils/password";
import type { RegisterInput } from "./auth.validation";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/**
 * The user as the app receives them.
 *
 * Not `AuthenticatedUser`: that is the set of claims carried in the token, and
 * a display name and avatar have no business being in a JWT.
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: IssuedRefreshToken;
}

const issueTokens = async (user: { id: string; email: string; role: Role }) => {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken.token),
      expiresAt: refreshToken.expiresAt,
    },
  });

  // Drop this user expired rows while we are already writing for them. Keeps
  // the table from growing forever without a scheduled job to run and monitor.
  // Scoped to one indexed user, so it stays a cheap delete.
  await prisma.refreshToken.deleteMany({
    where: { userId: user.id, expiresAt: { lt: new Date() } },
  });

  return { accessToken, refreshToken };
};

/**
 * Self-service signup. Always creates a plain USER - a client cannot ask for a
 * role, so this endpoint can never mint an admin. Elevating someone is an
 * admin-only action on the user module.
 */
export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict("A user with this email already exists");

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: Role.USER,
    },
  });

  const { accessToken, refreshToken } = await issueTokens(user);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
    accessToken,
    refreshToken,
  };
};

export const login = async (email: string, password: string): Promise<AuthResult> => {
  const user = await prisma.user.findUnique({ where: { email } });

  // Same message and work either way, so the response cannot be used to
  // discover which emails exist.
  const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !passwordMatches) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (!user.isActive) {
    throw ApiError.forbidden("This account has been deactivated");
  }

  const { accessToken, refreshToken } = await issueTokens(user);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
    accessToken,
    refreshToken,
  };
};

/**
 * Rotates a refresh token: the presented token is revoked and a new one issued.
 *
 * If the token verifies but is not on record, it has already been rotated -
 * which means someone is replaying an old token. Every session for that user is
 * revoked rather than quietly issuing a fresh pair.
 */
export const refresh = async (presentedToken: string): Promise<AuthResult> => {
  const payload = verifyRefreshToken(presentedToken);
  const tokenHash = hashToken(presentedToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  const revokeEverySession = () =>
    prisma.refreshToken.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });

  // Not on record at all: a forged or long-pruned token.
  if (!stored) {
    await revokeEverySession();
    throw ApiError.unauthorized("Refresh token has already been used");
  }

  // On record but already rotated. Since rotation is single-use, a second
  // presentation means two parties hold this token - so kill the whole family
  // rather than only failing this one request, which would leave the thief
  // freshly-issued token alive.
  if (stored.revokedAt) {
    await revokeEverySession();
    throw ApiError.unauthorized("Refresh token has already been used");
  }

  if (stored.expiresAt <= new Date()) {
    throw ApiError.unauthorized("Refresh token has expired");
  }
  if (!stored.user.isActive) {
    throw ApiError.forbidden("This account has been deactivated");
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const { accessToken, refreshToken } = await issueTokens(stored.user);

  return {
    user: {
      id: stored.user.id,
      name: stored.user.name,
      email: stored.user.email,
      role: stored.user.role,
      avatarUrl: stored.user.avatarUrl,
    },
    accessToken,
    refreshToken,
  };
};

export const logout = async (presentedToken: string | undefined): Promise<void> => {
  if (!presentedToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const getCurrentUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      createdAt: true,
    },
  });
  if (!user) throw ApiError.notFound("User not found");
  return user;
};
