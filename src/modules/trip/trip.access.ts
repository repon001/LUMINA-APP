import { randomBytes } from "node:crypto";
import { Role, TripVisibility, type Trip } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/api-error";
import type { AuthenticatedUser } from "../../utils/request";

/**
 * Who may do what to a trip, in one place.
 *
 * Every trip endpoint funnels through here rather than repeating `if (trip
 * .ownerId !== user.id)`. When collaborators arrive, this is the only file that
 * has to learn about them.
 */

export type TripViewer = AuthenticatedUser | undefined;

const isAdmin = (viewer: TripViewer) => viewer?.role === Role.ADMIN;
const isOwner = (trip: Pick<Trip, "ownerId">, viewer: TripViewer) => trip.ownerId === viewer?.id;

/** A trip anyone may read: listed publicly, or opened with its share code. */
const isPubliclyReadable = (trip: Pick<Trip, "visibility" | "shareCode">, shareCode?: string) => {
  if (trip.visibility === TripVisibility.PUBLIC) return true;
  return (
    trip.visibility === TripVisibility.UNLISTED &&
    Boolean(trip.shareCode) &&
    trip.shareCode === shareCode
  );
};

export const canView = (
  trip: Pick<Trip, "ownerId" | "visibility" | "shareCode">,
  viewer: TripViewer,
  shareCode?: string,
) => isOwner(trip, viewer) || isAdmin(viewer) || isPubliclyReadable(trip, shareCode);

export const canEdit = (trip: Pick<Trip, "ownerId">, viewer: TripViewer) =>
  isOwner(trip, viewer) || isAdmin(viewer);

/**
 * Loads a trip the viewer is allowed to read.
 *
 * A trip they may not see is reported as `404`, not `403`: a `403` would confirm
 * that the id exists, which is exactly what a private trip should not leak.
 */
export const findViewableTrip = async (id: string, viewer: TripViewer, shareCode?: string) => {
  const trip = await prisma.trip.findUnique({ where: { id } });
  if (!trip || !canView(trip, viewer, shareCode)) throw ApiError.notFound("Trip not found");
  return trip;
};

/** Loads a trip the viewer is allowed to change, or fails the same way. */
export const findEditableTrip = async (id: string, viewer: TripViewer) => {
  const trip = await prisma.trip.findUnique({ where: { id } });
  if (!trip) throw ApiError.notFound("Trip not found");

  if (!canEdit(trip, viewer)) {
    // Readers get a straight 403: they already know the trip exists.
    if (canView(trip, viewer)) throw ApiError.forbidden("Only the trip owner can change it");
    throw ApiError.notFound("Trip not found");
  }

  return trip;
};

/**
 * 24 bytes of randomness, base64url. Long enough that a share link cannot be
 * guessed, short enough to sit in a URL.
 */
export const newShareCode = () => randomBytes(18).toString("base64url");
