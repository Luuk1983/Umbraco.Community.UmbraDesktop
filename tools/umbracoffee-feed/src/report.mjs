/**
 * The description report (feed reliability design, section 4): flags episodes whose description on
 * YouTube is not the one in `sources.json`, so the owner can fix them by hand in `overrides.json`.
 * The feed only shows edits to the newest 15, and the backfilled episodes came from a watch-page
 * scrape, so this is how an older edit gets noticed at all.
 *
 * It prints ids, titles and links and never a description, and writes and keeps nothing: what the API
 * says is compared and dropped. Local only, never in the Action, because GitHub keeps Action logs
 * for 90 days, which would be storing.
 * Usage: `node src/report.mjs <data-dir>`, with `YOUTUBE_API_KEY` set.
 * @module report
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJson } from './files.mjs';
import { fetchSnippets } from './youtube.mjs';

/**
 * One flagged episode: enough to find it, nothing of its text.
 * @typedef {object} Flagged
 * @property {string} videoId The video id.
 * @property {string} title The title as `sources.json` has it.
 */

/**
 * A description's words, with everything a link can turn into left out: tokens holding a slash, an
 * at sign or a dotted name (a URL, a handle, an address, a bare domain), and the "/ handle" the watch
 * page shows for a social link. Lower case, letters and digits only, so list markers and punctuation
 * drop out too.
 * @param {string} text A description.
 * @returns {string[]} Its words, in order.
 */
function words(text) {
  return text
    .replace(/(^|\s)\/\s+\S+/g, ' ')
    .split(/\s+/)
    .filter((token) => !/[/@]|\w\.\w/.test(token))
    .join(' ')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Whether YouTube's description says nothing ours does not: every one of its words appears in ours,
 * in the same order. Most of `sources.json` came from a watch-page scrape, which dropped list markers
 * and showed links as their display text or, for a video, its title, so ours holds extra words but
 * never misses one. Measured 2026-10-17 over all 347 episodes: a whitespace-only comparison flagged
 * 295, this one none. An edit that adds or changes a word is still caught; one that only deletes
 * words is not, which a summary can live with.
 * @param {string} theirs The description on YouTube.
 * @param {string} ours The description in `sources.json`.
 * @returns {boolean} True when there is nothing new on YouTube to write a summary from.
 */
function saysNothingNew(theirs, ours) {
  const wanted = words(theirs);
  let found = 0;
  for (const word of words(ours)) if (found < wanted.length && word === wanted[found]) found++;
  return found === wanted.length;
}

/**
 * Compares every episode in `sources.json` with YouTube. A video YouTube no longer knows is in
 * neither list: it has nothing to fix from.
 * @param {object} options The inputs.
 * @param {string} options.dir The data folder holding `sources.json`.
 * @param {string} options.apiKey YouTube Data API key.
 * @param {typeof fetch} [options.fetchImpl] Fetch to use.
 * @returns {Promise<{ missing: Flagged[], differs: Flagged[] }>} Episodes with no description here that YouTube has one for, and episodes whose description differs, both in the list's order.
 * @throws {Error} When there is no `sources.json`, or the API fails (without the key in the message).
 */
export async function report({ dir, apiKey, fetchImpl = fetch }) {
  const sources = readJson(join(dir, 'sources.json'));
  if (!sources) throw new Error(`No sources.json in ${dir}`);
  const snippets = await fetchSnippets(sources.episodes.map((e) => e.videoId), { apiKey, fetchImpl });
  const missing = [];
  const differs = [];
  for (const episode of sources.episodes) {
    const theirs = snippets.get(episode.videoId);
    if (!theirs || saysNothingNew(theirs.description, episode.description)) continue;
    const flagged = { videoId: episode.videoId, title: episode.title };
    if (episode.description.trim() === '') missing.push(flagged);
    else differs.push(flagged);
  }
  return { missing, differs };
}

/**
 * Lays the report out for the terminal: each list under its heading, one episode per line as id,
 * title and link. An empty list says "none", so a clean report reads as checked rather than broken.
 * @param {{ missing: Flagged[], differs: Flagged[] }} result What {@link report} found.
 * @returns {string} The text to print.
 */
export function formatReport({ missing, differs }) {
  const section = (heading, list) => [
    `${heading} (${list.length})`,
    ...(list.length === 0 ? ['  none'] : list.map((e) => `  ${e.videoId}  ${e.title}  https://www.youtube.com/watch?v=${e.videoId}`)),
  ].join('\n');
  return [
    section('No description here, YouTube has one', missing),
    section('Description differs on YouTube', differs),
  ].join('\n\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!dir || !apiKey) {
    console.error('Usage: YOUTUBE_API_KEY=... node src/report.mjs <data-dir>');
    process.exit(2);
  }
  process.stdout.write(formatReport(await report({ dir, apiKey })));
}
