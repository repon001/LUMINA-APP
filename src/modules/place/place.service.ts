import { ModerationStatus, PlaceCategory, type Prisma } from "../../generated/prisma/client";
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
import { attachAutoImage } from "../image/image.service";
import type { CreatePlaceInput, NearbyPlacesQuery, UpdatePlaceInput } from "./place.validation";

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "ratingAvg", "ratingCount", "priceLevel", "price", "createdAt"],
  filterable: {
    destinationId: { kind: "string" },
    // Lets a client filter by the readable "?destination=tokyo" instead of a cuid.
    destination: { kind: "string", column: "destination.slug" },
    category: { kind: "enum", values: Object.values(PlaceCategory) },
    priceLevel: { kind: "number" },
    ratingAvg: { kind: "number" },
    isActive: { kind: "boolean" },
    tags: { kind: "stringList" },
  },
  searchable: ["name", "description", "address"],
  // "ramen" is a tag, not part of the restaurant's name.
  searchableLists: ["tags"],
  defaultSort: "-ratingAvg",
};

const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  category: true,
  address: true,
  latitude: true,
  longitude: true,
  priceLevel: true,
  price: true,
  currencyCode: true,
  imageUrl: true,
  tags: true,
  ratingAvg: true,
  ratingCount: true,
  destination: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.PlaceSelect;

/**
 * What a submitter gets back.
 *
 * The card fields plus where the entry stands, because a contributor needs to
 * be told their place is waiting rather than live. Kept out of CARD_SELECT: a
 * public listing is approved by definition, so the field would be noise there.
 */
const SUBMISSION_SELECT = {
  ...CARD_SELECT,
  status: true,
  submittedById: true,
} satisfies Prisma.PlaceSelect;

/** See destination.md: the box is the indexed half, the radius the exact half. */
const CANDIDATE_LIMIT = 500;

const isPlaceSlugTaken = async (destinationId: string, candidate: string, exceptId?: string) => {
  const existing = await prisma.place.findUnique({
    where: { destinationId_slug: { destinationId, slug: candidate } },
    select: { id: true },
  });
  return existing !== null && existing.id !== exceptId;
};

const requireDestination = async (destinationId: string) => {
  const destination = await prisma.destination.findUnique({
    where: { id: destinationId },
    select: { id: true },
  });
  if (!destination) throw ApiError.notFound("Destination not found");
  return destination;
};

export const listPlaces = async (query: Record<string, unknown>) => {
  const { where, orderBy, skip, take, page, limit } = buildListQuery(query, LIST_CONFIG);

  // Merged after the caller's filters, never taken from them.
  const publicWhere = { ...where, ...APPROVED_ONLY };

  const [items, total] = await Promise.all([
    prisma.place.findMany({ where: publicWhere, orderBy, skip, take, select: CARD_SELECT }),
    prisma.place.count({ where: publicWhere }),
  ]);

  return { items, total, page, limit };
};

/**
 * One place.
 *
 * A place still in the queue is visible to its submitter and to moderators. To
 * everyone else it does not exist yet.
 */
export const getPlace = async (id: string, viewer: Viewer | null = null) => {
  const place = await prisma.place.findUnique({
    where: { id },
    include: {
      destination: { select: { id: true, slug: true, name: true, timezone: true } },
      images: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, url: true },
      },
    },
  });

  if (!place) throw ApiError.notFound("Place not found");

  if (
    place.status !== ModerationStatus.APPROVED &&
    !canSeeUnapproved(viewer, place.submittedById)
  ) {
    throw ApiError.notFound("Place not found");
  }

  return place;
};

export const findNearbyPlaces = async ({
  lat,
  lng,
  radiusKm,
  limit,
  category,
}: NearbyPlacesQuery) => {
  const center = { latitude: lat, longitude: lng };
  const box = boundingBox(center, radiusKm);

  const candidates = await prisma.place.findMany({
    where: {
      isActive: true,
      ...APPROVED_ONLY,
      ...(category ? { category } : {}),
      latitude: { gte: box.minLatitude, lte: box.maxLatitude },
      longitude: { gte: box.minLongitude, lte: box.maxLongitude },
    },
    select: CARD_SELECT,
    take: CANDIDATE_LIMIT,
  });

  return candidates
    .map((place) => ({
      ...place,
      distanceKm: roundKm(
        distanceKm(center, {
          latitude: Number(place.latitude),
          longitude: Number(place.longitude),
        }),
      ),
    }))
    .filter((place) => place.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
};

/** Two entries for the same thing are close together and named the same. */
const DUPLICATE_RADIUS_KM = 0.2;

/**
 * Refuse an entry that already exists.
 *
 * Without this the queue fills with five copies of Tokyo Tower and a moderator
 * spends their time comparing them instead of reviewing anything new. The name
 * is compared case-insensitively; the distance keeps two genuinely different
 * places that share a name - a chain restaurant, say - from blocking each
 * other.
 */
const refuseNearDuplicate = async (input: CreatePlaceInput) => {
  const box = boundingBox(
    { latitude: input.latitude, longitude: input.longitude },
    DUPLICATE_RADIUS_KM,
  );

  const sameName = await prisma.place.findMany({
    where: {
      destinationId: input.destinationId,
      name: { equals: input.name.trim(), mode: "insensitive" },
      latitude: { gte: box.minLatitude, lte: box.maxLatitude },
      longitude: { gte: box.minLongitude, lte: box.maxLongitude },
    },
    select: { id: true, name: true, latitude: true, longitude: true, status: true },
  });

  const duplicate = sameName.find(
    (place) =>
      distanceKm(
        { latitude: input.latitude, longitude: input.longitude },
        { latitude: Number(place.latitude), longitude: Number(place.longitude) },
      ) <= DUPLICATE_RADIUS_KM,
  );

  if (duplicate) {
    throw ApiError.conflict(
      duplicate.status === ModerationStatus.APPROVED
        ? "That place is already in the guide"
        : "Somebody has already suggested that place; it is waiting for review",
      { existingId: duplicate.id },
    );
  }
};

export const createPlace = async (input: CreatePlaceInput, submitter: Viewer) => {
  await requireDestination(input.destinationId);
  await refuseNearDuplicate(input);

  if (input.slug && (await isPlaceSlugTaken(input.destinationId, input.slug))) {
    throw ApiError.conflict("A place with this slug already exists in this destination");
  }

  const slug =
    input.slug ?? (await uniqueSlug(input.name, (c) => isPlaceSlugTaken(input.destinationId, c)));

  const status = statusForSubmission(submitter);

  const created = await prisma.place.create({
    data: {
      destinationId: input.destinationId,
      slug,
      name: input.name,
      category: input.category,
      description: input.description ?? null,
      address: input.address ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      priceLevel: input.priceLevel ?? null,
      price: input.price ?? null,
      currencyCode: input.currencyCode ?? null,
      imageUrl: input.imageUrl ?? null,
      website: input.website ?? null,
      phone: input.phone ?? null,
      tags: input.tags ?? [],
      status,
      submittedById: submitter.id,
      ...(status === ModerationStatus.APPROVED
        ? { reviewedById: submitter.id, reviewedAt: new Date() }
        : {}),
    },
    select: SUBMISSION_SELECT,
  });

  // Same as destinations: found now rather than later, so the entry never
  // appears without a picture and then grows one.
  await attachAutoImage(
    { placeId: created.id },
    `${created.name} ${created.destination.name}`,
    created.category,
  );

  return created;
};

export const updatePlace = async (id: string, input: UpdatePlaceInput) => {
  const place = await prisma.place.findUnique({
    where: { id },
    select: { id: true, destinationId: true },
  });
  if (!place) throw ApiError.notFound("Place not found");

  if (input.slug && (await isPlaceSlugTaken(place.destinationId, input.slug, id))) {
    throw ApiError.conflict("A place with this slug already exists in this destination");
  }

  return prisma.place.update({
    where: { id },
    data: {
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.priceLevel !== undefined ? { priceLevel: input.priceLevel } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: CARD_SELECT,
  });
};

export const deletePlace = async (id: string) => {
  const place = await prisma.place.findUnique({ where: { id }, select: { id: true } });
  if (!place) throw ApiError.notFound("Place not found");

  await prisma.place.delete({ where: { id } });
};
