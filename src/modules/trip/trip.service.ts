import { TripStatus, TripVisibility, type Prisma } from "../../generated/prisma/client";
import { prisma, type PrismaTx } from "../../config/prisma";
import { ApiError } from "../../utils/api-error";
import { buildListQuery, type ListQueryConfig } from "../../utils/query-builder";
import type { AuthenticatedUser } from "../../utils/request";
import { findEditableTrip, findViewableTrip, newShareCode, type TripViewer } from "./trip.access";
import type {
  AddStopInput,
  CreateTripInput,
  DuplicateTripInput,
  ReorderStopsInput,
  ShareTripInput,
  UpdateStopInput,
  UpdateTripInput,
} from "./trip.validation";

const MY_TRIPS_CONFIG: ListQueryConfig = {
  sortable: ["title", "startDate", "endDate", "createdAt", "updatedAt", "status"],
  filterable: {
    status: { kind: "enum", values: Object.values(TripStatus) },
    visibility: { kind: "enum", values: Object.values(TripVisibility) },
    startDate: { kind: "date" },
    endDate: { kind: "date" },
    tags: { kind: "stringList" },
  },
  searchable: ["title", "summary"],
  searchableLists: ["tags"],
  defaultSort: "-updatedAt",
};

const PUBLIC_TRIPS_CONFIG: ListQueryConfig = {
  ...MY_TRIPS_CONFIG,
  // Visibility is fixed to PUBLIC by the service, so it is not a client filter.
  filterable: {
    status: { kind: "enum", values: Object.values(TripStatus) },
    tags: { kind: "stringList" },
  },
};

const CARD_SELECT = {
  id: true,
  title: true,
  summary: true,
  coverImageUrl: true,
  startDate: true,
  endDate: true,
  status: true,
  visibility: true,
  tags: true,
  updatedAt: true,
  owner: { select: { id: true, name: true } },
  stops: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      position: true,
      destination: { select: { id: true, slug: true, name: true, countryCode: true } },
    },
  },
  _count: { select: { stops: true } },
} satisfies Prisma.TripSelect;

const DETAIL_INCLUDE = {
  owner: { select: { id: true, name: true } },
  stops: {
    orderBy: { position: "asc" },
    include: {
      destination: {
        select: {
          id: true,
          slug: true,
          name: true,
          country: true,
          countryCode: true,
          latitude: true,
          longitude: true,
          coverImageUrl: true,
        },
      },
    },
  },
} satisfies Prisma.TripInclude;

/**
 * Rewrites positions from 0 upwards, in the order given.
 *
 * `@@unique([tripId, position])` means positions cannot be shuffled in place -
 * the first update would collide with a row that has not moved yet. So every
 * stop is parked above the range first, then written back down.
 */
const PARK_OFFSET = 10_000;

const renumber = async (tx: PrismaTx, orderedIds: string[]) => {
  for (const [index, id] of orderedIds.entries()) {
    await tx.tripStop.update({ where: { id }, data: { position: PARK_OFFSET + index } });
  }
  for (const [index, id] of orderedIds.entries()) {
    await tx.tripStop.update({ where: { id }, data: { position: index } });
  }
};

const nextPosition = async (tx: PrismaTx, tripId: string) => {
  const last = await tx.tripStop.findFirst({
    where: { tripId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return last ? last.position + 1 : 0;
};

export const listMyTrips = async (userId: string, query: Record<string, unknown>) => {
  const { where, orderBy, skip, take, page, limit } = buildListQuery(query, MY_TRIPS_CONFIG);

  const scoped = { AND: [{ ownerId: userId }, where] };
  const [items, total] = await Promise.all([
    prisma.trip.findMany({ where: scoped, orderBy, skip, take, select: CARD_SELECT }),
    prisma.trip.count({ where: scoped }),
  ]);

  return { items, total, page, limit };
};

export const listPublicTrips = async (query: Record<string, unknown>) => {
  const { where, orderBy, skip, take, page, limit } = buildListQuery(query, PUBLIC_TRIPS_CONFIG);

  const scoped = { AND: [{ visibility: TripVisibility.PUBLIC }, where] };
  const [items, total] = await Promise.all([
    prisma.trip.findMany({ where: scoped, orderBy, skip, take, select: CARD_SELECT }),
    prisma.trip.count({ where: scoped }),
  ]);

  return { items, total, page, limit };
};

export const getTrip = async (id: string, viewer: TripViewer, shareCode?: string) => {
  await findViewableTrip(id, viewer, shareCode);
  return prisma.trip.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE });
};

/** The "anyone with the link" entry point: the code alone identifies the trip. */
export const getTripByShareCode = async (shareCode: string) => {
  const trip = await prisma.trip.findUnique({ where: { shareCode }, include: DETAIL_INCLUDE });
  if (!trip || trip.visibility === TripVisibility.PRIVATE) {
    throw ApiError.notFound("Trip not found");
  }
  return trip;
};

export const createTrip = async (ownerId: string, input: CreateTripInput) =>
  prisma.trip.create({
    data: {
      ownerId,
      title: input.title,
      summary: input.summary ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: input.status ?? TripStatus.DRAFT,
      visibility: input.visibility ?? TripVisibility.PRIVATE,
      budgetTotal: input.budgetTotal ?? null,
      currencyCode: input.currencyCode ?? null,
      tags: input.tags ?? [],
    },
    include: DETAIL_INCLUDE,
  });

export const updateTrip = async (id: string, viewer: TripViewer, input: UpdateTripInput) => {
  const trip = await findEditableTrip(id, viewer);

  // Either date may be cleared on its own, so a one-sided change still has to be
  // checked against whatever is already stored.
  const startDate = input.startDate !== undefined ? input.startDate : trip.startDate;
  const endDate = input.endDate !== undefined ? input.endDate : trip.endDate;
  if (startDate && endDate && endDate < startDate) {
    throw ApiError.badRequest("endDate cannot be before startDate");
  }

  return prisma.trip.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.budgetTotal !== undefined ? { budgetTotal: input.budgetTotal } : {}),
      ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
    },
    include: DETAIL_INCLUDE,
  });
};

export const deleteTrip = async (id: string, viewer: TripViewer) => {
  await findEditableTrip(id, viewer);
  await prisma.trip.delete({ where: { id } });
};

export const shareTrip = async (id: string, viewer: TripViewer, input: ShareTripInput) => {
  const trip = await findEditableTrip(id, viewer);

  // Keep the existing code unless a new one is asked for, so a link already sent
  // to someone keeps working when a trip goes from unlisted to public.
  const shareCode = trip.shareCode && !input.regenerate ? trip.shareCode : newShareCode();

  return prisma.trip.update({
    where: { id },
    data: { visibility: input.visibility, shareCode },
    select: { id: true, visibility: true, shareCode: true },
  });
};

/** Back to private, and the old link stops working. */
export const unshareTrip = async (id: string, viewer: TripViewer) => {
  await findEditableTrip(id, viewer);

  return prisma.trip.update({
    where: { id },
    data: { visibility: TripVisibility.PRIVATE, shareCode: null },
    select: { id: true, visibility: true, shareCode: true },
  });
};

/**
 * Copies a trip into the caller's account, including its route.
 *
 * Anyone who can *see* a trip can duplicate it - that is the point of publishing
 * an itinerary. The copy is always private, always owned by the caller, and
 * always a draft: it is their plan now, not a view of someone else's.
 */
export const duplicateTrip = async (
  id: string,
  user: AuthenticatedUser,
  input: DuplicateTripInput,
  shareCode?: string,
) => {
  const source = await findViewableTrip(id, user, shareCode);
  const stops = await prisma.tripStop.findMany({
    where: { tripId: id },
    orderBy: { position: "asc" },
  });

  return prisma.trip.create({
    data: {
      ownerId: user.id,
      title: input.title ?? `${source.title} (copy)`,
      summary: source.summary,
      coverImageUrl: source.coverImageUrl,
      startDate: source.startDate,
      endDate: source.endDate,
      status: TripStatus.DRAFT,
      visibility: TripVisibility.PRIVATE,
      budgetTotal: source.budgetTotal,
      currencyCode: source.currencyCode,
      tags: source.tags,
      stops: {
        create: stops.map((stop) => ({
          destinationId: stop.destinationId,
          position: stop.position,
          arrivalDate: stop.arrivalDate,
          departureDate: stop.departureDate,
          transportToNext: stop.transportToNext,
          notes: stop.notes,
        })),
      },
    },
    include: DETAIL_INCLUDE,
  });
};

export const addStop = async (tripId: string, viewer: TripViewer, input: AddStopInput) => {
  await findEditableTrip(tripId, viewer);

  const destination = await prisma.destination.findUnique({
    where: { id: input.destinationId },
    select: { id: true },
  });
  if (!destination) throw ApiError.notFound("Destination not found");

  if (input.arrivalDate && input.departureDate && input.departureDate < input.arrivalDate) {
    throw ApiError.badRequest("departureDate cannot be before arrivalDate");
  }

  return prisma.$transaction(async (tx) => {
    const end = await nextPosition(tx, tripId);
    const target = input.position === undefined ? end : Math.min(input.position, end);

    // Created at the end, where no row can collide, then moved into place.
    const created = await tx.tripStop.create({
      data: {
        tripId,
        destinationId: input.destinationId,
        position: end,
        arrivalDate: input.arrivalDate ?? null,
        departureDate: input.departureDate ?? null,
        transportToNext: input.transportToNext ?? null,
        notes: input.notes ?? null,
      },
    });

    if (target !== end) {
      const others = await tx.tripStop.findMany({
        where: { tripId, id: { not: created.id } },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      const order = others.map((stop) => stop.id);
      order.splice(target, 0, created.id);
      await renumber(tx, order);
    }

    return tx.tripStop.findUniqueOrThrow({
      where: { id: created.id },
      include: { destination: { select: { id: true, slug: true, name: true } } },
    });
  });
};

export const updateStop = async (
  tripId: string,
  stopId: string,
  viewer: TripViewer,
  input: UpdateStopInput,
) => {
  await findEditableTrip(tripId, viewer);

  const stop = await prisma.tripStop.findFirst({ where: { id: stopId, tripId } });
  if (!stop) throw ApiError.notFound("Stop not found on this trip");

  const arrivalDate = input.arrivalDate !== undefined ? input.arrivalDate : stop.arrivalDate;
  const departureDate =
    input.departureDate !== undefined ? input.departureDate : stop.departureDate;
  if (arrivalDate && departureDate && departureDate < arrivalDate) {
    throw ApiError.badRequest("departureDate cannot be before arrivalDate");
  }

  return prisma.tripStop.update({
    where: { id: stopId },
    data: {
      ...(input.arrivalDate !== undefined ? { arrivalDate: input.arrivalDate } : {}),
      ...(input.departureDate !== undefined ? { departureDate: input.departureDate } : {}),
      ...(input.transportToNext !== undefined ? { transportToNext: input.transportToNext } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: { destination: { select: { id: true, slug: true, name: true } } },
  });
};

export const removeStop = async (tripId: string, stopId: string, viewer: TripViewer) => {
  await findEditableTrip(tripId, viewer);

  const stop = await prisma.tripStop.findFirst({ where: { id: stopId, tripId } });
  if (!stop) throw ApiError.notFound("Stop not found on this trip");

  await prisma.$transaction(async (tx) => {
    await tx.tripStop.delete({ where: { id: stopId } });

    // Close the gap, so positions stay 0..n-1 and the route has no hole in it.
    const remaining = await tx.tripStop.findMany({
      where: { tripId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    await renumber(
      tx,
      remaining.map((row) => row.id),
    );
  });
};

export const reorderStops = async (
  tripId: string,
  viewer: TripViewer,
  input: ReorderStopsInput,
) => {
  await findEditableTrip(tripId, viewer);

  const stops = await prisma.tripStop.findMany({ where: { tripId }, select: { id: true } });
  const known = new Set(stops.map((stop) => stop.id));
  const requested = new Set(input.stopIds);

  // The whole route must be listed exactly once: a partial order would leave the
  // remaining stops with no defined place to go.
  if (requested.size !== input.stopIds.length) {
    throw ApiError.badRequest("Stop ids must not repeat");
  }
  if (requested.size !== known.size || input.stopIds.some((id) => !known.has(id))) {
    throw ApiError.badRequest("Send every stop of this trip exactly once, in the new order");
  }

  await prisma.$transaction((tx) => renumber(tx, input.stopIds));

  return prisma.tripStop.findMany({
    where: { tripId },
    orderBy: { position: "asc" },
    include: { destination: { select: { id: true, slug: true, name: true } } },
  });
};
