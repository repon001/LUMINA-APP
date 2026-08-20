import { ModerationStatus, type Prisma } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/api-error";
import { boundingBox, distanceKm, roundKm } from "../../utils/geo";
import { buildListQuery, type ListQueryConfig } from "../../utils/query-builder";
import {
  APPROVED_ONLY,
  canSeeUnapproved,
  statusForSubmission,
  type Viewer,
} from "../moderation/moderation.access";
import { uniqueSlug } from "../../utils/slug";
import type {
  CreateDestinationInput,
  NearbyQuery,
  UpdateDestinationInput,
} from "./destination.validation";

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "country", "createdAt", "updatedAt"],
  filterable: {
    countryCode: { kind: "string" },
    isFeatured: { kind: "boolean" },
    isActive: { kind: "boolean" },
    tags: { kind: "stringList" },
  },
  searchable: ["name", "country", "description"],
  searchableLists: ["tags"],
  defaultSort: "name",
};

/** Enough to render a destination card; the detail route adds the rest. */
const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  country: true,
  countryCode: true,
  latitude: true,
  longitude: true,
  coverImageUrl: true,
  tags: true,
  isFeatured: true,
} satisfies Prisma.DestinationSelect;

/**
 * A proximity search is deliberately two steps: an indexed range scan over the
 * bounding box, then an exact distance measured in memory. Postgres cannot use
 * an index for the trigonometry, so asking it to sort by distance would mean a
 * sequential scan of every destination on earth.
 *
 * `CANDIDATE_LIMIT` bounds the in-memory half. It is generous next to any
 * sensible `limit`, and the box is small enough that hitting it means the
 * radius was too large to be a "near me" query in the first place.
 */
const CANDIDATE_LIMIT = 500;

const isDestinationSlugTaken = async (candidate: string, exceptId?: string) => {
  const existing = await prisma.destination.findUnique({
    where: { slug: candidate },
    select: { id: true },
  });
  return existing !== null && existing.id !== exceptId;
};

export const listDestinations = async (query: Record<string, unknown>) => {
  const { where, orderBy, skip, take, page, limit } = buildListQuery(query, LIST_CONFIG);

  // Merged after the caller's filters, never taken from them.
  const publicWhere = { ...where, ...APPROVED_ONLY };

  const [items, total] = await Promise.all([
    prisma.destination.findMany({ where: publicWhere, orderBy, skip, take, select: CARD_SELECT }),
    prisma.destination.count({ where: publicWhere }),
  ]);

  return { items, total, page, limit };
};

/**
 * Accepts either the cuid or the slug, so a client can link by name.
 *
 * A destination still in the queue is visible to its submitter and to
 * moderators. To everyone else it does not exist yet.
 */
export const getDestination = async (idOrSlug: string, viewer: Viewer | null = null) => {
  const destination = await prisma.destination.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { _count: { select: { places: true } } },
  });

  if (!destination) throw ApiError.notFound("Destination not found");

  if (
    destination.status !== ModerationStatus.APPROVED &&
    !canSeeUnapproved(viewer, destination.submittedById)
  ) {
    throw ApiError.notFound("Destination not found");
  }

  return destination;
};

export const findNearbyDestinations = async ({ lat, lng, radiusKm, limit }: NearbyQuery) => {
  const center = { latitude: lat, longitude: lng };
  const box = boundingBox(center, radiusKm);

  const candidates = await prisma.destination.findMany({
    where: {
      isActive: true,
      ...APPROVED_ONLY,
      latitude: { gte: box.minLatitude, lte: box.maxLatitude },
      longitude: { gte: box.minLongitude, lte: box.maxLongitude },
    },
    select: CARD_SELECT,
    take: CANDIDATE_LIMIT,
  });

  return (
    candidates
      .map((destination) => ({
        ...destination,
        distanceKm: roundKm(
          distanceKm(center, {
            latitude: Number(destination.latitude),
            longitude: Number(destination.longitude),
          }),
        ),
      }))
      // The box has corners the radius does not reach, so the circle is applied here.
      .filter((destination) => destination.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit)
  );
};

export const createDestination = async (input: CreateDestinationInput, submitter: Viewer) => {
  const slug = input.slug ?? (await uniqueSlug(input.name, (c) => isDestinationSlugTaken(c)));

  if (input.slug && (await isDestinationSlugTaken(input.slug))) {
    throw ApiError.conflict("A destination with this slug already exists");
  }

  const status = statusForSubmission(submitter);
  const isModerator = status === ModerationStatus.APPROVED;

  return prisma.destination.create({
    data: {
      slug,
      name: input.name,
      country: input.country,
      countryCode: input.countryCode,
      description: input.description ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      timezone: input.timezone ?? null,
      currencyCode: input.currencyCode ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      tags: input.tags ?? [],
      // Only a moderator gets to decide this; a submission is never featured.
      isFeatured: isModerator ? (input.isFeatured ?? false) : false,
      status,
      submittedById: submitter.id,
      ...(status === ModerationStatus.APPROVED
        ? { reviewedById: submitter.id, reviewedAt: new Date() }
        : {}),
    },
  });
};

export const updateDestination = async (id: string, input: UpdateDestinationInput) => {
  const existing = await prisma.destination.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound("Destination not found");

  if (input.slug && (await isDestinationSlugTaken(input.slug, id))) {
    throw ApiError.conflict("A destination with this slug already exists");
  }

  return prisma.destination.update({
    where: { id },
    data: {
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
      ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
};

/**
 * Removal is refused while places still hang off the destination. The database
 * would cascade them away silently, which is not something an admin should be
 * able to do by mistake - deactivate instead, or clear the places first.
 */
export const deleteDestination = async (id: string) => {
  const destination = await prisma.destination.findUnique({
    where: { id },
    select: { id: true, _count: { select: { places: true } } },
  });
  if (!destination) throw ApiError.notFound("Destination not found");

  if (destination._count.places > 0) {
    throw ApiError.conflict(
      `Destination still has ${destination._count.places} place(s). Deactivate it instead.`,
    );
  }

  await prisma.destination.delete({ where: { id } });
};
