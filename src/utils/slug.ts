/**
 * Turns a display name into a URL-safe slug: "Kyōto Station!" -> "kyoto-station".
 *
 * Accents are folded rather than dropped, so "Kyōto" and "Kyoto" produce the
 * same slug instead of "kyto".
 */
export const slugify = (value: string, maxLength = 80): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");

/**
 * Finds a slug nobody has taken yet, by appending -2, -3, and so on.
 *
 * `isTaken` is passed in rather than queried here, so the same logic serves
 * every model without this helper knowing about Prisma.
 */
export const uniqueSlug = async (
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> => {
  const root = slugify(base) || "item";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = attempt === 1 ? root : `${root}-${attempt}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  // Practically unreachable; a random tail beats throwing on the 50th duplicate.
  return `${root}-${Math.random().toString(36).slice(2, 8)}`;
};
