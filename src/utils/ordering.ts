/** Positions above any real row, used while an order is being rewritten. */
const PARK_OFFSET = 10_000;

/**
 * Rewrites `position` from 0 upwards, in the order given.
 *
 * Ordered collections here are unique on `(parentId, position)`, which is what
 * makes an itinerary an order rather than a set. That uniqueness also means
 * positions cannot be shuffled in place: the first update would collide with a
 * row that has not moved yet. So every row is parked above the used range and
 * then written back down.
 *
 * ```
 *   want: [B, C, A]
 *
 *   pass 1 (park)          pass 2 (land)
 *   B: 0 -> 10000          B: 10000 -> 0
 *   C: 1 -> 10001          C: 10001 -> 1
 *   A: 2 -> 10002          A: 10002 -> 2
 * ```
 *
 * The caller supplies `setPosition` and runs it inside a transaction, so this
 * stays independent of which model is being ordered.
 */
export const renumber = async (
  setPosition: (id: string, position: number) => Promise<unknown>,
  orderedIds: readonly string[],
): Promise<void> => {
  for (const [index, id] of orderedIds.entries()) {
    await setPosition(id, PARK_OFFSET + index);
  }
  for (const [index, id] of orderedIds.entries()) {
    await setPosition(id, index);
  }
};

/**
 * Checks that a requested order names every row exactly once.
 *
 * A partial order would leave the rest with no defined place to go - silently,
 * and differently depending on how the rows happened to come back from the
 * database. The client always knows the full list, so it sends the full list.
 */
export const validateFullOrder = (
  requestedIds: readonly string[],
  knownIds: readonly string[],
): { ok: true } | { ok: false; reason: "duplicate" | "mismatch" } => {
  const requested = new Set(requestedIds);
  if (requested.size !== requestedIds.length) return { ok: false, reason: "duplicate" };

  const known = new Set(knownIds);
  if (requested.size !== known.size || requestedIds.some((id) => !known.has(id))) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true };
};
