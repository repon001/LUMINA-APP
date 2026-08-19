import type { Prisma } from "../../generated/prisma/client";
import { prisma, type PrismaTx } from "../../config/prisma";
import { ApiError } from "../../utils/api-error";
import { renumber, validateFullOrder } from "../../utils/ordering";
import { findEditableTrip, findViewableTrip, type TripViewer } from "../trip/trip.access";
import type {
  AddDayInput,
  AddItemInput,
  MoveItemInput,
  ReorderDaysInput,
  ReorderItemsInput,
  UpdateDayInput,
  UpdateItemInput,
} from "./itinerary.validation";

const ITEM_INCLUDE = {
  place: {
    select: {
      id: true,
      slug: true,
      name: true,
      category: true,
      latitude: true,
      longitude: true,
      imageUrl: true,
    },
  },
} satisfies Prisma.ItineraryItemInclude;

const DAY_INCLUDE = {
  items: { orderBy: { position: "asc" }, include: ITEM_INCLUDE },
} satisfies Prisma.TripDayInclude;

/** Days are 1-based; items are 0-based, like every other position here. */
const renumberDays = (tx: PrismaTx, orderedIds: readonly string[]) =>
  renumber(
    (id, position) => tx.tripDay.update({ where: { id }, data: { dayNumber: position + 1 } }),
    orderedIds,
  );

const renumberItems = (tx: PrismaTx, orderedIds: readonly string[]) =>
  renumber(
    (id, position) => tx.itineraryItem.update({ where: { id }, data: { position } }),
    orderedIds,
  );

const dayIdsOf = async (tx: PrismaTx, tripId: string) => {
  const days = await tx.tripDay.findMany({
    where: { tripId },
    orderBy: { dayNumber: "asc" },
    select: { id: true },
  });
  return days.map((day) => day.id);
};

const itemIdsOf = async (tx: PrismaTx, tripDayId: string) => {
  const items = await tx.itineraryItem.findMany({
    where: { tripDayId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return items.map((item) => item.id);
};

/** A day, confirmed to belong to the trip the caller named. */
const requireDayOfTrip = async (tripId: string, dayId: string) => {
  const day = await prisma.tripDay.findFirst({ where: { id: dayId, tripId } });
  if (!day) throw ApiError.notFound("Day not found on this trip");
  return day;
};

const requirePlace = async (placeId: string) => {
  const place = await prisma.place.findUnique({ where: { id: placeId }, select: { id: true } });
  if (!place) throw ApiError.notFound("Place not found");
};

export const getItinerary = async (tripId: string, viewer: TripViewer, shareCode?: string) => {
  await findViewableTrip(tripId, viewer, shareCode);

  return prisma.tripDay.findMany({
    where: { tripId },
    orderBy: { dayNumber: "asc" },
    include: DAY_INCLUDE,
  });
};

export const addDay = async (tripId: string, viewer: TripViewer, input: AddDayInput) => {
  await findEditableTrip(tripId, viewer);

  return prisma.$transaction(async (tx) => {
    const existing = await dayIdsOf(tx, tripId);
    const target =
      input.dayNumber === undefined
        ? existing.length
        : Math.min(input.dayNumber - 1, existing.length);

    // Created past the end, where no row can collide, then moved into place.
    const created = await tx.tripDay.create({
      data: {
        tripId,
        dayNumber: existing.length + 1,
        date: input.date ?? null,
        title: input.title ?? null,
        notes: input.notes ?? null,
      },
    });

    if (target !== existing.length) {
      const order = [...existing];
      order.splice(target, 0, created.id);
      await renumberDays(tx, order);
    }

    return tx.tripDay.findUniqueOrThrow({ where: { id: created.id }, include: DAY_INCLUDE });
  });
};

export const updateDay = async (
  tripId: string,
  dayId: string,
  viewer: TripViewer,
  input: UpdateDayInput,
) => {
  await findEditableTrip(tripId, viewer);
  await requireDayOfTrip(tripId, dayId);

  return prisma.tripDay.update({
    where: { id: dayId },
    data: {
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: DAY_INCLUDE,
  });
};

/** Removing a day removes its items with it, and closes the numbering gap. */
export const removeDay = async (tripId: string, dayId: string, viewer: TripViewer) => {
  await findEditableTrip(tripId, viewer);
  await requireDayOfTrip(tripId, dayId);

  await prisma.$transaction(async (tx) => {
    await tx.tripDay.delete({ where: { id: dayId } });
    await renumberDays(tx, await dayIdsOf(tx, tripId));
  });
};

export const reorderDays = async (tripId: string, viewer: TripViewer, input: ReorderDaysInput) => {
  await findEditableTrip(tripId, viewer);

  const known = await prisma.tripDay.findMany({ where: { tripId }, select: { id: true } });
  const check = validateFullOrder(
    input.dayIds,
    known.map((day) => day.id),
  );
  if (!check.ok) {
    throw ApiError.badRequest(
      check.reason === "duplicate"
        ? "Day ids must not repeat"
        : "Send every day of this trip exactly once, in the new order",
    );
  }

  await prisma.$transaction((tx) => renumberDays(tx, input.dayIds));

  return prisma.tripDay.findMany({
    where: { tripId },
    orderBy: { dayNumber: "asc" },
    include: DAY_INCLUDE,
  });
};

export const addItem = async (
  tripId: string,
  dayId: string,
  viewer: TripViewer,
  input: AddItemInput,
) => {
  await findEditableTrip(tripId, viewer);
  await requireDayOfTrip(tripId, dayId);
  if (input.placeId) await requirePlace(input.placeId);

  return prisma.$transaction(async (tx) => {
    const existing = await itemIdsOf(tx, dayId);
    const target =
      input.position === undefined ? existing.length : Math.min(input.position, existing.length);

    const created = await tx.itineraryItem.create({
      data: {
        tripDayId: dayId,
        position: existing.length,
        kind: input.kind ?? "PLACE",
        title: input.title,
        placeId: input.placeId ?? null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        cost: input.cost ?? null,
        currencyCode: input.currencyCode ?? null,
        transportMode: input.transportMode ?? null,
        notes: input.notes ?? null,
      },
    });

    if (target !== existing.length) {
      const order = [...existing];
      order.splice(target, 0, created.id);
      await renumberItems(tx, order);
    }

    return tx.itineraryItem.findUniqueOrThrow({ where: { id: created.id }, include: ITEM_INCLUDE });
  });
};

export const updateItem = async (
  tripId: string,
  dayId: string,
  itemId: string,
  viewer: TripViewer,
  input: UpdateItemInput,
) => {
  await findEditableTrip(tripId, viewer);
  await requireDayOfTrip(tripId, dayId);

  const item = await prisma.itineraryItem.findFirst({ where: { id: itemId, tripDayId: dayId } });
  if (!item) throw ApiError.notFound("Item not found on this day");
  if (input.placeId) await requirePlace(input.placeId);

  // Either time may be cleared on its own, so the pair is re-checked against
  // what is already stored.
  const startTime = input.startTime !== undefined ? input.startTime : item.startTime;
  const endTime = input.endTime !== undefined ? input.endTime : item.endTime;
  if (startTime && endTime && endTime < startTime) {
    throw ApiError.badRequest("endTime cannot be before startTime");
  }

  return prisma.itineraryItem.update({
    where: { id: itemId },
    data: {
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.placeId !== undefined ? { placeId: input.placeId } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
      ...(input.cost !== undefined ? { cost: input.cost } : {}),
      ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
      ...(input.transportMode !== undefined ? { transportMode: input.transportMode } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: ITEM_INCLUDE,
  });
};

export const removeItem = async (
  tripId: string,
  dayId: string,
  itemId: string,
  viewer: TripViewer,
) => {
  await findEditableTrip(tripId, viewer);
  await requireDayOfTrip(tripId, dayId);

  const item = await prisma.itineraryItem.findFirst({ where: { id: itemId, tripDayId: dayId } });
  if (!item) throw ApiError.notFound("Item not found on this day");

  await prisma.$transaction(async (tx) => {
    await tx.itineraryItem.delete({ where: { id: itemId } });
    await renumberItems(tx, await itemIdsOf(tx, dayId));
  });
};

export const reorderItems = async (
  tripId: string,
  dayId: string,
  viewer: TripViewer,
  input: ReorderItemsInput,
) => {
  await findEditableTrip(tripId, viewer);
  await requireDayOfTrip(tripId, dayId);

  const known = await prisma.itineraryItem.findMany({
    where: { tripDayId: dayId },
    select: { id: true },
  });
  const check = validateFullOrder(
    input.itemIds,
    known.map((item) => item.id),
  );
  if (!check.ok) {
    throw ApiError.badRequest(
      check.reason === "duplicate"
        ? "Item ids must not repeat"
        : "Send every item of this day exactly once, in the new order",
    );
  }

  await prisma.$transaction((tx) => renumberItems(tx, input.itemIds));

  return prisma.itineraryItem.findMany({
    where: { tripDayId: dayId },
    orderBy: { position: "asc" },
    include: ITEM_INCLUDE,
  });
};

/**
 * Drags a card onto another day - the app's main editing gesture.
 *
 * Both days are renumbered in one transaction: the source closes its gap and the
 * destination opens one, so neither is left with a hole or a duplicate position.
 */
export const moveItem = async (
  tripId: string,
  dayId: string,
  itemId: string,
  viewer: TripViewer,
  input: MoveItemInput,
) => {
  await findEditableTrip(tripId, viewer);
  await requireDayOfTrip(tripId, dayId);
  await requireDayOfTrip(tripId, input.toDayId);

  const item = await prisma.itineraryItem.findFirst({ where: { id: itemId, tripDayId: dayId } });
  if (!item) throw ApiError.notFound("Item not found on this day");

  return prisma.$transaction(async (tx) => {
    const destinationIds = (await itemIdsOf(tx, input.toDayId)).filter((id) => id !== itemId);
    const target =
      input.position === undefined
        ? destinationIds.length
        : Math.min(input.position, destinationIds.length);

    // Parked at the end of the destination day, then both days are renumbered.
    await tx.itineraryItem.update({
      where: { id: itemId },
      data: { tripDayId: input.toDayId, position: destinationIds.length },
    });

    if (input.toDayId !== dayId) {
      await renumberItems(tx, await itemIdsOf(tx, dayId));
    }

    const order = [...destinationIds];
    order.splice(target, 0, itemId);
    await renumberItems(tx, order);

    return tx.itineraryItem.findUniqueOrThrow({ where: { id: itemId }, include: ITEM_INCLUDE });
  });
};
