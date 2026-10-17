/**
 * One Action run (v2 design section 4, the addendum of 2026-10-01, and the feed reliability design
 * of 2026-10-17): ask the API what is new, read the feed only when something is, update
 * `sources.json`, rebuild `episodes.json` from it and the two hand-made files, decide
 * `next-episode.json`, report. No AI and no key beyond the optional YouTube one: `details.json` and
 * `overrides.json` are only ever read here.
 * Usage: `node src/run.mjs <data-dir>`, with `YOUTUBE_API_KEY` optional.
 * @module run
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFeed } from './rss.mjs';
import { compareUploads, mergeEpisodes, refreshFromFeed } from './episodes.mjs';
import { checkTitle, fetchVideo, latestUploads } from './youtube.mjs';
import { nextEpisode } from './next-episode.mjs';
import { rebuildEpisodes } from './build.mjs';
import { iso, readJson, serialise, writeIfChanged } from './files.mjs';

/** The umbraCoffee channel. The feed is keyless and lists only the 15 newest videos. */
export const CHANNEL_ID = 'UCF_Ene5-58a3Z55aw8O6Djg';

/**
 * How long to wait before the second and the third attempt at the feed. The feed's failures come in
 * stretches of hours at night (measured 2026-10-11 to 17), so a retry mostly catches the odd single
 * failure by day; the longer the spacing, the longer every failing run holds a runner.
 */
export const FEED_RETRY_DELAYS_MS = [15_000, 45_000];

/**
 * The source list as it stands. Before the v2 data exists, the v1 `episodes.json` held exactly what
 * `sources.json` holds now, so it seeds the list: without that, a first v2 run ahead of the one-off
 * migration would rebuild the app's list from the 15 feed entries and drop the back catalogue.
 * @param {string} dir The data folder.
 * @returns {{ file: {version: number, generatedAt: string, episodes: object[]}|null, seeded: boolean }} The current file (null when there is none) and whether it came from the v1 file.
 */
function readSources(dir) {
  const sources = readJson(join(dir, 'sources.json'));
  if (sources) return { file: sources, seeded: false };
  const old = readJson(join(dir, 'episodes.json'));
  if (old?.version === 1 && Array.isArray(old.episodes)) return { file: old, seeded: true };
  return { file: null, seeded: false };
}

/**
 * Reads the channel feed once.
 * @param {typeof fetch} fetchImpl The fetch to use.
 * @returns {Promise<import('./rss.mjs').FeedEntry[]>} The entries that carry an id.
 * @throws {Error} When the feed cannot be reached, answers anything but 200, or is not a feed.
 */
async function readFeedOnce(fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
  } catch (error) {
    // The feed URL carries no key, so the runtime's own message is safe to pass on.
    throw new Error(`The channel feed could not be reached: ${error.message}`);
  }
  if (response.status !== 200) throw new Error(`The channel feed answered HTTP ${response.status}`);
  return parseFeed(await response.text()).filter((entry) => entry.videoId !== '');
}

/**
 * Reads the channel feed, trying again after each of {@link FEED_RETRY_DELAYS_MS}. A blocked page that
 * is not a feed is retried like a 404: both are YouTube having a bad moment.
 * @param {typeof fetch} fetchImpl The fetch to use.
 * @param {(ms: number) => Promise<void>} wait Waits between attempts; tests pass one that returns at once.
 * @returns {Promise<import('./rss.mjs').FeedEntry[]>} The entries that carry an id.
 * @throws {Error} The last attempt's error, when every attempt failed.
 */
async function readFeed(fetchImpl, wait) {
  let lastError;
  for (let attempt = 0; attempt <= FEED_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await wait(FEED_RETRY_DELAYS_MS[attempt - 1]);
    try {
      return await readFeedOnce(fetchImpl);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Raises a GitHub warning annotation, so a run that did its job despite a failure is green but says
 * so on the run's page. The three characters workflow commands treat specially are escaped.
 * @param {string} message What went wrong. Never contains the key: every API error is made fresh.
 */
function annotate(message) {
  const escaped = message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::warning::${escaped}`);
}

/**
 * Waits, for real, between feed attempts.
 * @param {number} ms How long.
 * @returns {Promise<void>} Resolves when the time is up.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Performs one run. Everything that touches the outside world is a parameter, so the tests run it
 * over a temp directory with a fake fetch.
 *
 * With a key, the API's newest uploads decide whether the feed is read at all, and its new ids
 * decide the next episode, so neither depends on the feed answering. Nothing from the API's answer
 * is stored: it is compared with `sources.json` and dropped. Only when neither source answers is the
 * run red (the table in the feed reliability design, section 3.1).
 * @param {object} options The inputs.
 * @param {string} options.dir The data folder (`sources.json`, `episodes.json`, `next-episode.json`, and the read-only `details.json` and `overrides.json`); created if missing.
 * @param {typeof fetch} [options.fetchImpl] Fetch to use.
 * @param {string} [options.apiKey] YouTube Data API key. Without it the feed is read every run, the episode list is still kept current and the next-episode file stays empty (E13).
 * @param {Date} [options.now] The current moment.
 * @param {string} [options.githubOutput] Path of `$GITHUB_OUTPUT`; when set, `changed=true|false` is appended to it.
 * @param {(ms: number) => Promise<void>} [options.wait] Waits between feed attempts; injectable so tests do not sit out the delays.
 * @param {(message: string) => void} [options.warn] Raises a warning that leaves the run green; a GitHub annotation by default.
 * @returns {Promise<{ changed: boolean, sourcesChanged: boolean, episodesChanged: boolean, nextChanged: boolean }>} What was written.
 * @throws {Error} When the feed cannot be read and the API cannot stand in for it: a failed run must be red, not a silent "nothing new".
 */
export async function run({ dir, fetchImpl = fetch, apiKey, now = new Date(), githubOutput, wait = sleep, warn = annotate }) {
  mkdirSync(dir, { recursive: true });
  const sourcesPath = join(dir, 'sources.json');
  const nextPath = join(dir, 'next-episode.json');
  const { file: existing, seeded } = readSources(dir);
  const stored = existing?.episodes ?? [];

  let compared = null;
  if (apiKey) {
    try {
      compared = compareUploads(stored, await latestUploads(CHANNEL_ID, { apiKey, fetchImpl }));
    } catch (error) {
      warn(`Could not ask the API what is new, so the feed decides this run and the next episode is left as it is: ${error.message}`);
    }
  }
  const feedNeeded = !compared || compared.newIds.length > 0 || compared.changedIds.length > 0;

  let entries = null;
  if (feedNeeded) {
    try {
      entries = await readFeed(fetchImpl, wait);
    } catch (error) {
      if (!compared) throw error;
      warn(`The episode list waits for a run the feed answers: ${error.message}`);
    }
  }

  let merged = { episodes: stored, added: [], changed: false };
  let refreshed = { updated: [], changed: false };
  if (entries) {
    const known = new Set(stored.map((e) => e.videoId));
    // The feed already carries titles. oEmbed is only the fallback for a new entry that arrives
    // without one; a known entry with no title simply keeps the one it has.
    for (const entry of entries) {
      if (entry.title.trim() === '' && !known.has(entry.videoId)) {
        entry.title = (await checkTitle(entry.videoId, fetchImpl)) ?? entry.videoId;
      }
    }
    refreshed = refreshFromFeed(stored, entries);
    merged = mergeEpisodes(refreshed.episodes, entries);
  }

  // With neither a list nor a feed (a first run while the feed is down) there is nothing to write:
  // an empty list would replace the app's episodes with none.
  let sourcesChanged = false;
  let episodesChanged = false;
  if (existing || entries) {
    const sourcesFile = merged.changed || refreshed.changed || !existing || seeded
      ? { version: 1, generatedAt: iso(now), episodes: merged.episodes }
      : existing;
    sourcesChanged = writeIfChanged(sourcesPath, serialise(sourcesFile));
    episodesChanged = rebuildEpisodes(dir, now).changed;
  }

  // The API's new ids, not the feed's: a new episode is announced even while the feed is down. One
  // the feed has not listed yet stays new on every run and is looked up each time, which is 1 unit.
  const newIds = compared ? compared.newIds : merged.added;
  const previous = readJson(nextPath);
  let lookup = null;
  let apiFailed = Boolean(apiKey) && !compared;
  if (apiKey && compared) {
    const answers = new Map();
    const ids = new Set(newIds);
    if (previous?.episode?.videoId) ids.add(previous.episode.videoId);
    for (const id of ids) {
      try {
        answers.set(id, await fetchVideo(id, { apiKey, fetchImpl }));
      } catch (error) {
        warn(`Skipping the next-episode update: ${error.message}`);
        apiFailed = true;
        break;
      }
    }
    lookup = (id) => answers.get(id);
  }
  let nextChanged = false;
  if (!apiFailed) {
    const next = nextEpisode({ previous, newIds, lookup, now });
    if (next.changed) nextChanged = writeIfChanged(nextPath, serialise(next.file));
  }

  const changed = sourcesChanged || episodesChanged || nextChanged;
  if (githubOutput) appendFileSync(githubOutput, `changed=${changed}\n`);
  const api = !apiKey ? 'no key' : compared ? `${compared.newIds.length} new, ${compared.changedIds.length} changed` : 'failed';
  const feed = !feedNeeded ? 'not read' : entries ? 'read' : 'failed';
  console.log(`api: ${api}, feed: ${feed}, episodes: ${merged.episodes.length} (${merged.added.length} added, ${refreshed.updated.length} updated), episodes.json: ${episodesChanged ? 'rebuilt' : 'unchanged'}, next-episode: ${nextChanged ? 'updated' : 'unchanged'}, changed=${changed}`);
  return { changed, sourcesChanged, episodesChanged, nextChanged };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node src/run.mjs <data-dir>');
    process.exit(2);
  }
  await run({ dir, apiKey: process.env.YOUTUBE_API_KEY || undefined, githubOutput: process.env.GITHUB_OUTPUT });
}
