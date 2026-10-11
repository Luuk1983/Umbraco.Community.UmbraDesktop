import { UMBRACOFFEE_DATA_BASE_URL } from './constants.js';
import {
  isEpisodesFile,
  isNextEpisodeFile,
  type UmbraCoffeeEpisodesFile,
  type UmbraCoffeeNextFile,
} from './types.js';

/** What one read of the data branch gave. A file that could not be had, or was not valid, is left out. */
export interface UmbraCoffeeFeedResult {
  /** `episodes.json`, when it came and was valid. */
  episodes?: UmbraCoffeeEpisodesFile;
  /** `next-episode.json`, when it came and was valid. */
  next?: UmbraCoffeeNextFile;
}

/** Fetches both files, or as much as it can. Never rejects. */
export type UmbraCoffeeFetcher = () => Promise<UmbraCoffeeFeedResult>;

/**
 * Fetches one JSON file and checks it. Every way it can go wrong (a rejected request, a blocked host,
 * a non-200, a body that is not JSON, a body of the wrong shape) is the same answer, undefined,
 * because the caller's only question is whether it has a usable file.
 * @param url The file's address.
 * @param guard The runtime check for the file's shape.
 * @param fetchImpl The fetch to use.
 * @returns The parsed file, or undefined.
 */
async function readFile<T>(url: string, guard: (value: unknown) => value is T, fetchImpl: typeof fetch): Promise<T | undefined> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    return guard(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads `episodes.json` and `next-episode.json` from the data branch, in parallel and independently:
 * one file failing never costs the other, and the caller decides what half an answer means.
 * @param fetchImpl The fetch to use; the browser's, except for whatever a test passes in its place.
 * @returns The files that came back valid. Never rejects.
 */
export async function fetchFeed(fetchImpl: typeof fetch = (...args) => fetch(...args)): Promise<UmbraCoffeeFeedResult> {
  const [episodes, next] = await Promise.all([
    readFile(`${UMBRACOFFEE_DATA_BASE_URL}/episodes.json`, isEpisodesFile, fetchImpl),
    readFile(`${UMBRACOFFEE_DATA_BASE_URL}/next-episode.json`, isNextEpisodeFile, fetchImpl),
  ]);
  return { ...(episodes && { episodes }), ...(next && { next }) };
}
