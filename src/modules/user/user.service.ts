import { Role } from "../../generated/prisma/client";
import { destroyUpload } from "../../config/cloudinary";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/api-error";
import { hashPassword, verifyPassword } from "../../utils/password";
import { buildListQuery, type ListQueryConfig } from "../../utils/query-builder";
import type { CreateUserInput, UpdateProfileInput, UpdateUserInput } from "./user.validation";

/** Never select passwordHash - it must not leave the service layer. */
const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "email", "role", "createdAt", "updatedAt"],
  filterable: {
    role: { kind: "enum", values: Object.values(Role) },
    isActive: { kind: "boolean" },
    createdAt: { kind: "date" },
  },
  searchable: ["name", "email"],
  defaultSort: "-createdAt",
};

export const listUsers = async (query: Record<string, unknown>) => {
  const { where, orderBy, skip, take, page, limit } = buildListQuery(query, LIST_CONFIG);

  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy, skip, take, select: USER_SELECT }),
    prisma.user.count({ where }),
  ]);

  return { items, total, page, limit };
};

export const getUserById = async (id: string) => {
  const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!user) throw ApiError.notFound("User not found");
  return user;
};

export const createUser = async (input: CreateUserInput) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict("A user with this email already exists");

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    },
    select: USER_SELECT,
  });
};

export const updateUser = async (id: string, input: UpdateUserInput, actingUserId: string) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound("User not found");

  // Guard against an admin locking themselves out of their own account.
  if (id === actingUserId) {
    if (input.isActive === false) {
      throw ApiError.badRequest("You cannot deactivate your own account");
    }
    if (input.role && input.role !== user.role) {
      throw ApiError.badRequest("You cannot change your own role");
    }
  }

  if (input.email && input.email !== user.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email } });
    if (clash) throw ApiError.conflict("A user with this email already exists");
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password !== undefined ? { passwordHash: await hashPassword(input.password) } : {}),
    },
    select: USER_SELECT,
  });

  // Changing a password or disabling an account must end existing sessions.
  if (input.password !== undefined || input.isActive === false) {
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return updated;
};

/**
 * A user editing their own account.
 *
 * Changing a password needs the current one, even though the request is already
 * authenticated: an access token left open on a shared machine should not be
 * enough to lock the owner out of their own account.
 */
export const updateMyProfile = async (userId: string, input: UpdateProfileInput) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found");

  if (input.password !== undefined) {
    const correct = await verifyPassword(input.currentPassword ?? "", user.passwordHash);
    if (!correct) throw ApiError.badRequest("That is not your current password");
  }

  if (input.email && input.email !== user.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email } });
    if (clash) throw ApiError.conflict("A user with this email already exists");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.password !== undefined ? { passwordHash: await hashPassword(input.password) } : {}),
    },
    select: USER_SELECT,
  });

  // A new password ends every other session, which is the point of changing it.
  if (input.password !== undefined) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return updated;
};

/**
 * Point a user at a freshly uploaded avatar, and tidy away the one it replaced.
 *
 * The delete happens after the update, never before: if it ran first and the
 * update then failed, the user would be left pointing at a file that no longer
 * exists.
 */
export const setMyAvatar = async (userId: string, file: { url: string; publicId: string }) => {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPublicId: true },
  });
  if (!current) throw ApiError.notFound("User not found");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: file.url, avatarPublicId: file.publicId },
    select: USER_SELECT,
  });

  await destroyUpload(current.avatarPublicId);
  return updated;
};

/** Back to the initials. */
export const removeMyAvatar = async (userId: string) => {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPublicId: true },
  });
  if (!current) throw ApiError.notFound("User not found");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null, avatarPublicId: null },
    select: USER_SELECT,
  });

  await destroyUpload(current.avatarPublicId);
  return updated;
};
