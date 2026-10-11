/**
 * One-off, manual (design E3): merges the channel's back catalogue into `sources.json`, which the
 * RSS feed cannot supply because it stops at the 15 newest videos, then rebuilds `episodes.json`.
 * Reads `id,published` lines from stdin. The dates must come from the scrape: oEmbed has no dates,
 * and a made-up one would put an episode in the wrong place in a list that is sorted by it. oEmbed
 * has no description either, so a backfilled entry starts with an empty one. `pending` then hands
 * the prompt only the title, and the prompt is written for that case.
 * Usage: `node src/backfill.mjs <data-dir> < ids.csv`.
 * @module backfill
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeEpisodes, toIsoUtc } from './episodes.mjs';
import { checkTitle } from './youtube.mjs';
import { rebuildEpisodes } from './build.mjs';
import { iso, readJson, serialise, writeIfChanged } from './files.mjs';

/**
 * Parses `id,published` lines. Blank lines and lines starting with `#` are skipped.
 * @param {string} text The CSV text.
 * @returns {Array<{videoId: string, published: string}>} The rows.
 * @throws {Error} Naming the line when it has no id or no valid date; bare ids are refused on purpose.
 */
export function parseCsv(text) {
  const rows = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const [videoId, published] = line.split(',').map((part) => part?.trim());
    if (!videoId || !published || Number.isNaN(Date.parse(published))) {
      throw new Error(`Bad backfill line ${index + 1}: expected "id,published" with a real date, got "${line}"`);
    }
    rows.push({ videoId, published });
  });
  return rows;
}

/**
 * Checks each unknown id with oEmbed and merges the ones that still exist.
 * @param {object} args The inputs.
 * @param {Array<{videoId: string}>} args.existing The current source list.
 * @param {Array<{videoId: string, published: string}>} args.rows Parsed CSV rows.
 * @param {typeof fetch} [args.fetchImpl] Fetch to use.
 * @returns {Promise<{ episodes: object[], added: string[], skipped: string[] }>} The new list, the ids merged, and the ids oEmbed did not know (private or deleted).
 */
export async function backfill({ existing, rows, fetchImpl = fetch }) {
  const known = new Set(existing.map((e) => e.videoId));
  const entries = [];
  const skipped = [];
  for (const row of rows) {
    if (known.has(row.videoId)) continue;
    const title = await checkTitle(row.videoId, fetchImpl);
    if (title === undefined) {
      skipped.push(row.videoId);
      continue;
    }
    entries.push({ videoId: row.videoId, title, published: toIsoUtc(row.published), description: '' });
  }
  const merged = mergeEpisodes(existing, entries);
  return { episodes: merged.episodes, added: merged.added, skipped };
}

/**
 * Runs a backfill over a data folder: merges into its `sources.json` (an empty list when there is
 * none yet) and rebuilds its `episodes.json`, so the app's list never lags the sources.
 * @param {object} args The inputs.
 * @param {string} args.dir The data folder.
 * @param {Array<{videoId: string, published: string}>} args.rows Parsed CSV rows.
 * @param {typeof fetch} [args.fetchImpl] Fetch to use.
 * @param {Date} [args.now] Used for `generatedAt` when something was added.
 * @returns {Promise<{ added: string[], skipped: string[] }>} The ids merged and the ids oEmbed did not know.
 */
export async function backfillDir({ dir, rows, fetchImpl = fetch, now = new Date() }) {
  const path = join(dir, 'sources.json');
  const file = readJson(path) ?? { version: 1, episodes: [] };
  const result = await backfill({ existing: file.episodes, rows, fetchImpl });
  if (result.added.length > 0 || !file.generatedAt) {
    writeIfChanged(path, serialise({ version: 1, generatedAt: iso(now), episodes: result.episodes }));
  }
  rebuildEpisodes(dir, now);
  return { added: result.added, skipped: result.skipped };
}

/**
 * Reads all of stdin as text.
 * @returns {Promise<string>} Everything piped in.
 */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node src/backfill.mjs <data-dir> < ids.csv');
    process.exit(2);
  }
  const result = await backfillDir({ dir, rows: parseCsv(await readStdin()) });
  console.log(`Added ${result.added.length}, skipped ${result.skipped.length}${result.skipped.length ? `: ${result.skipped.join(', ')}` : ''}`);
}
