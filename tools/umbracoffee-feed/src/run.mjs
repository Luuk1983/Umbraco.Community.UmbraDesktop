/**
 * One Action run (design section 4, and the addendum of 2026-10-01): read the feed, update
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
import { mergeEpisodes, refreshFromFeed } from './episodes.mjs';
import { checkTitle, fetchVideo } from './youtube.mjs';
import { nextEpisode } from './next-episode.mjs';
import { rebuildEpisodes } from './build.mjs';
import { iso, readJson, serialise, writeIfChanged } from './files.mjs';

/** The umbraCoffee channel. The feed is keyless and lists only the 15 newest videos. */
export const CHANNEL_ID = 'UCF_Ene5-58a3Z55aw8O6Djg';

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
 * Performs one run. Everything that touches the outside world is a parameter, so the tests run it
 * over a temp directory with a fake fetch.
 * @param {object} options The inputs.
 * @param {string} options.dir The data folder (`sources.json`, `episodes.json`, `next-episode.json`, and the read-only `details.json` and `overrides.json`); created if missing.
 * @param {typeof fetch} [options.fetchImpl] Fetch to use.
 * @param {string} [options.apiKey] YouTube Data API key. Without it the episode list is still kept current and the next-episode file stays empty (E13).
 * @param {Date} [options.now] The current moment.
 * @param {string} [options.githubOutput] Path of `$GITHUB_OUTPUT`; when set, `changed=true|false` is appended to it.
 * @returns {Promise<{ changed: boolean, sourcesChanged: boolean, episodesChanged: boolean, nextChanged: boolean }>} What was written.
 * @throws {Error} When the feed cannot be read or is not a feed: a failed run must be red, not a silent "nothing new".
 */
export async function run({ dir, fetchImpl = fetch, apiKey, now = new Date(), githubOutput }) {
  mkdirSync(dir, { recursive: true });
  const sourcesPath = join(dir, 'sources.json');
  const nextPath = join(dir, 'next-episode.json');

  const response = await fetchImpl(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
  if (response.status !== 200) throw new Error(`The channel feed answered HTTP ${response.status}`);
  const entries = parseFeed(await response.text()).filter((entry) => entry.videoId !== '');

  const { file: existing, seeded } = readSources(dir);
  const known = new Set((existing?.episodes ?? []).map((e) => e.videoId));
  // The feed already carries titles. oEmbed is only the fallback for a new entry that arrives
  // without one; a known entry with no title simply keeps the one it has.
  for (const entry of entries) {
    if (entry.title.trim() === '' && !known.has(entry.videoId)) {
      entry.title = (await checkTitle(entry.videoId, fetchImpl)) ?? entry.videoId;
    }
  }

  const refreshed = refreshFromFeed(existing?.episodes ?? [], entries);
  const merged = mergeEpisodes(refreshed.episodes, entries);
  const sourcesFile = merged.changed || refreshed.changed || !existing || seeded
    ? { version: 1, generatedAt: iso(now), episodes: merged.episodes }
    : existing;
  const sourcesChanged = writeIfChanged(sourcesPath, serialise(sourcesFile));
  const episodesChanged = rebuildEpisodes(dir, now).changed;

  const previous = readJson(nextPath);
  let lookup = null;
  let apiFailed = false;
  if (apiKey) {
    const answers = new Map();
    const ids = new Set(merged.added);
    if (previous?.episode?.videoId) ids.add(previous.episode.videoId);
    for (const id of ids) {
      try {
        answers.set(id, await fetchVideo(id, { apiKey, fetchImpl }));
      } catch (error) {
        console.warn(`Skipping the next-episode update: ${error.message}`);
        apiFailed = true;
        break;
      }
    }
    lookup = (id) => answers.get(id);
  }
  let nextChanged = false;
  if (!apiFailed) {
    const next = nextEpisode({ previous, newIds: merged.added, lookup, now });
    if (next.changed) nextChanged = writeIfChanged(nextPath, serialise(next.file));
  }

  const changed = sourcesChanged || episodesChanged || nextChanged;
  if (githubOutput) appendFileSync(githubOutput, `changed=${changed}\n`);
  console.log(`episodes: ${merged.episodes.length} (${merged.added.length} new, ${refreshed.updated.length} updated), episodes.json: ${episodesChanged ? 'rebuilt' : 'unchanged'}, next-episode: ${nextChanged ? 'updated' : 'unchanged'}, changed=${changed}`);
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
