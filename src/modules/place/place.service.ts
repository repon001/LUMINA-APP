import { PlaceCategory, type Prisma } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/api-error";
import { boundingBox, distanceKm, roundKm } from "../../utils/geo";
import { buildListQuery, type ListQueryConfig } from "../../utils/query-builder";
import { uniqueSlug } from "../../utils/slug";
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

  const [items, total] = await Promise.all([
    prisma.place.findMany({ where, orderBy, skip, take, select: CARD_SELECT }),
    prisma.place.count({ where }),
  ]);

  return { items, total, page, limit };
};

export const getPlace = async (id: string) => {
  const place = await prisma.place.findUnique({
    where: { id },
    include: { destination: { select: { id: true, slug: true, name: true, timezone: true } } },
  });

  if (!place) throw ApiError.notFound("Place not found");
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

export const createPlace = async (input: CreatePlaceInput) => {
  await requireDestination(input.destinationId);

  if (input.slug && (await isPlaceSlugTaken(input.destinationId, input.slug))) {
    throw ApiError.conflict("A place with this slug already exists in this destination");
  }

  const slug =
    input.slug ?? (await uniqueSlug(input.name, (c) => isPlaceSlugTaken(input.destinationId, c)));

  return prisma.place.create({
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
    },
    select: CARD_SELECT,
  });
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
