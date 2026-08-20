import { ModerationStatus, type Prisma } from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/api-error";
import type { QueueQuery, SubmissionKind } from "./moderation.validation";
import type { Viewer } from "./moderation.access";

/**
 * Enough to judge a submission from the list: what it is, where it is, and who
 * sent it. The reviewer opens the item itself for the rest.
 */
const QUEUE_SELECT = {
  id: true,
  slug: true,
  name: true,
  latitude: true,
  longitude: true,
  status: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
  submittedBy: { select: { id: true, name: true, email: true } },
} as const;

const DESTINATION_SELECT = {
  ...QUEUE_SELECT,
  country: true,
  countryCode: true,
} satisfies Prisma.DestinationSelect;

const PLACE_SELECT = {
  ...QUEUE_SELECT,
  category: true,
  destination: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.PlaceSelect;

export type DestinationEntry = Prisma.DestinationGetPayload<{ select: typeof DESTINATION_SELECT }>;
export type PlaceEntry = Prisma.PlaceGetPayload<{ select: typeof PLACE_SELECT }>;
export type QueueEntry = DestinationEntry | PlaceEntry;

/**
 * One page of submissions of a single kind.
 *
 * Oldest first, deliberately: a queue sorted newest-first starves the entries
 * that have waited longest, which are exactly the ones somebody is wondering
 * about.
 */
export const listQueue = async ({ kind, status, page, limit }: QueueQuery) => {
  const where = { status };
  const skip = (page - 1) * limit;
  const orderBy = { createdAt: "asc" } as const;

  const [items, total]: [QueueEntry[], number] =
    kind === "destination"
      ? await Promise.all([
          prisma.destination.findMany({
            where,
            orderBy,
            skip,
            take: limit,
            select: DESTINATION_SELECT,
          }),
          prisma.destination.count({ where }),
        ])
      : await Promise.all([
          prisma.place.findMany({ where, orderBy, skip, take: limit, select: PLACE_SELECT }),
          prisma.place.count({ where }),
        ]);

  return { items, total, page, limit };
};

/** What the dashboard needs for a badge, without loading either list. */
export const queueCounts = async () => {
  const [destinations, places] = await Promise.all([
    prisma.destination.count({ where: { status: ModerationStatus.PENDING } }),
    prisma.place.count({ where: { status: ModerationStatus.PENDING } }),
  ]);

  return { destinations, places, total: destinations + places };
};

/**
 * Deciding twice is refused rather than quietly re-stamped: two moderators
 * working the same queue should not overwrite each other's reasons.
 */
const ensurePending = (existing: { status: ModerationStatus } | null) => {
  if (!existing) throw ApiError.notFound("Submission not found");

  if (existing.status !== ModerationStatus.PENDING) {
    throw ApiError.conflict(`That submission was already ${existing.status.toLowerCase()}`);
  }
};

const review = async (
  kind: SubmissionKind,
  id: string,
  decision: ModerationStatus,
  reviewer: Viewer,
  note?: string,
): Promise<QueueEntry> => {
  const data = {
    status: decision,
    reviewedById: reviewer.id,
    reviewedAt: new Date(),
    reviewNote: note ?? null,
  };

  if (kind === "destination") {
    ensurePending(await prisma.destination.findUnique({ where: { id }, select: { status: true } }));
    return prisma.destination.update({ where: { id }, data, select: DESTINATION_SELECT });
  }

  ensurePending(await prisma.place.findUnique({ where: { id }, select: { status: true } }));
  return prisma.place.update({ where: { id }, data, select: PLACE_SELECT });
};

export const approve = (kind: SubmissionKind, id: string, reviewer: Viewer) =>
  review(kind, id, ModerationStatus.APPROVED, reviewer);

export const reject = (kind: SubmissionKind, id: string, reviewer: Viewer, note: string) =>
  review(kind, id, ModerationStatus.REJECTED, reviewer, note);

/** Everything one contributor has sent, whatever state it is in. */
export const listMySubmissions = async (userId: string) => {
  const [destinations, places] = await Promise.all([
    prisma.destination.findMany({
      where: { submittedById: userId },
      orderBy: { createdAt: "desc" },
      select: DESTINATION_SELECT,
    }),
    prisma.place.findMany({
      where: { submittedById: userId },
      orderBy: { createdAt: "desc" },
      select: PLACE_SELECT,
    }),
  ]);

  return { destinations, places };
};
