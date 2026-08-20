import { env } from "../../config/env";

/**
 * Finding a photograph for something nobody uploaded one for.
 *
 * A note on the obvious approach: asking a language model for an image URL does
 * not work. Models return plausible-looking links that 404, because they are
 * generating text shaped like a URL rather than looking anything up. So the
 * picture always comes from a real image API, and the wording of the search is
 * the only part worth being clever about.
 */

const UNSPLASH = "https://images.unsplash.com";
const SEARCH_URL = "https://api.unsplash.com/search/photos";

/**
 * The same curated photographs the app falls back to, so a server with no
 * Unsplash key still produces something that looks deliberate rather than a
 * grey box.
 */
const CURATED: Record<string, string> = {
  ATTRACTION: "photo-1528164344705-47542687000d",
  HOTEL: "photo-1566073771259-6a8506099945",
  RESTAURANT: "photo-1551882547-ff40c63fe5fa",
  ACTIVITY: "photo-1533105079780-92b9be482077",
  SHOPPING: "photo-1441986300917-64674bd600d8",
  NIGHTLIFE: "photo-1514933651103-005eec06c04b",
  TRANSPORT: "photo-1474487548417-781cb71495f3",
  CITY: "photo-1476514525535-07fb3b4ae5f1",
  OTHER: "photo-1476514525535-07fb3b4ae5f1",
};

const curatedUrl = (key: string) =>
  `${UNSPLASH}/${CURATED[key] ?? CURATED.OTHER}?auto=format&fit=crop&w=1600&q=80`;

export interface AutoImage {
  url: string;
  /** Where it came from. Only an uploaded file has a Cloudinary id to delete. */
  source: "unsplash" | "curated";
}

/**
 * Ask Unsplash for a photograph of somewhere.
 *
 * Returns null on any failure rather than throwing: a submission that has
 * everything except a picture should still be accepted.
 */
const searchUnsplash = async (query: string): Promise<AutoImage | null> => {
  if (!env.UNSPLASH_ACCESS_KEY) return null;

  try {
    const url = `${SEARCH_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;

    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}` },
      signal: AbortSignal.timeout(env.AUTO_IMAGE_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { results?: { urls?: { regular?: string } }[] };
    const found = body.results?.[0]?.urls?.regular;

    return found ? { url: found, source: "unsplash" } : null;
  } catch {
    // A missing picture is not a reason to lose the submission.
    return null;
  }
};

/**
 * A photograph for a newly submitted city or place.
 *
 * `fallbackKey` is a place's category, or "CITY" for a destination.
 */
export const findImageFor = async (query: string, fallbackKey: string): Promise<AutoImage> =>
  (await searchUnsplash(query)) ?? { url: curatedUrl(fallbackKey), source: "curated" };
