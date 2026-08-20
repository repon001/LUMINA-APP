import { ModerationStatus, Role } from "../../generated/prisma/client";

/**
 * The moderation rules, in one place.
 *
 * Destinations and places are moderated identically, and the rule is a security
 * boundary: written twice it would eventually be relaxed once. Everything that
 * decides who sees what lives here.
 */

/** Whoever is asking, when anyone is. Public routes often have nobody. */
export interface Viewer {
  id: string;
  role: Role;
}

/**
 * The filter every public listing must carry.
 *
 * Applied in the service rather than accepted as a query parameter - and
 * `status` is deliberately absent from every `filterable` config, because a
 * filter the caller can set is a filter the caller can unset.
 */
export const APPROVED_ONLY = { status: ModerationStatus.APPROVED } as const;

const isModerator = (viewer: Viewer | null): boolean =>
  viewer?.role === Role.ADMIN || viewer?.role === Role.MODERATOR;

/**
 * Who may look at something still in the queue.
 *
 * Moderators, so they can review it, and whoever submitted it, so they can see
 * what they sent. Everyone else is told it does not exist rather than that they
 * are not allowed - a 403 confirms the thing is there.
 */
export const canSeeUnapproved = (viewer: Viewer | null, submittedById: string | null): boolean =>
  isModerator(viewer) || (viewer !== null && submittedById !== null && viewer.id === submittedById);

/**
 * Where a new submission starts.
 *
 * A moderator adding a place is doing the reviewing at the same time, so their
 * own entries skip the queue. Everyone else waits.
 */
export const statusForSubmission = (viewer: Viewer): ModerationStatus =>
  isModerator(viewer) ? ModerationStatus.APPROVED : ModerationStatus.PENDING;

export { isModerator };
