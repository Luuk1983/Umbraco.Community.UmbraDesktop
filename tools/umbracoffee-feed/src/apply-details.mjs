/**
 * Takes the answers of a details session, checks every one against the prompt's output shape, stamps
 * each with the source hash it was made from, merges them into `details.json` and rebuilds
 * `episodes.json`. A file with any bad entry is refused whole, so a half-applied session never has
 * to be untangled. Never writes `overrides.json`, which is the owner's alone.
 * Usage: `node src/apply-details.mjs <data-dir> <results.json>`.
 * @module apply-details
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pendingEpisodes, readData, rebuildEpisodes, sourceHash } from './build.mjs';
import { readJson, serialise, writeIfChanged } from './files.mjs';

/** The keys of one result: the prompt's output plus the `videoId` it belongs to. */
const RESULT_KEYS = ['videoId', 'summary', 'guests', 'guestsUnnamed', 'uncertain', 'uncertainReason'];

/** The keys of one guest in a result. */
const GUEST_KEYS = ['name', 'affiliation'];

/**
 * Whether a value is a plain object, the only thing a result or a guest may be.
 * @param {unknown} value Anything.
 * @returns {boolean} True for a non-null, non-array object.
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lists the keys an object has that it should not, and the ones it lacks.
 * @param {object} value The object.
 * @param {string[]} keys The keys it must have, and the only ones.
 * @param {string} prefix Prepended to each problem, for a guest's position.
 * @returns {string[]} One problem per key.
 */
function keyProblems(value, keys, prefix) {
  const problems = [];
  for (const key of Object.keys(value)) if (!keys.includes(key)) problems.push(`${prefix}unexpected key "${key}"`);
  for (const key of keys) if (!Object.hasOwn(value, key)) problems.push(`${prefix}missing key "${key}"`);
  return problems;
}

/**
 * Checks one result. Beyond the types, it holds the answer to the two rules the prompt states as
 * pairs: `uncertain` comes with a reason and only then, and unnamed guests means an empty list.
 * @param {unknown} entry One element of the results array.
 * @param {Set<string>} known The ids in `sources.json`.
 * @returns {string[]} The problems, empty when the entry is good.
 */
function entryProblems(entry, known) {
  if (!isObject(entry)) return ['not an object'];
  const problems = keyProblems(entry, RESULT_KEYS, '');
  // A missing key is already reported above, so each check below only looks at keys that are there.
  const has = (key) => Object.hasOwn(entry, key);
  if (has('videoId') && (typeof entry.videoId !== 'string' || !known.has(entry.videoId))) problems.push('videoId is not in sources.json');
  if (has('summary') && typeof entry.summary !== 'string') problems.push('summary must be a string');
  if (has('guests') && !Array.isArray(entry.guests)) {
    problems.push('guests must be an array');
  } else if (has('guests')) {
    entry.guests.forEach((guest, i) => {
      const at = `guests[${i}]`;
      if (!isObject(guest)) {
        problems.push(`${at} must be an object`);
        return;
      }
      problems.push(...keyProblems(guest, GUEST_KEYS, `${at}: `));
      if (Object.hasOwn(guest, 'name') && (typeof guest.name !== 'string' || guest.name.trim() === '')) problems.push(`${at}.name must be a non-empty string`);
      if (Object.hasOwn(guest, 'affiliation') && guest.affiliation !== null && typeof guest.affiliation !== 'string') problems.push(`${at}.affiliation must be a string or null`);
    });
  }
  if (has('guestsUnnamed')) {
    // Not tied to `guests` being empty: a description can name one guest and mention others
    // ("joined by Jane Doe, plus the masterclass participants"), so it means "some are not named".
    if (typeof entry.guestsUnnamed !== 'boolean') problems.push('guestsUnnamed must be true or false');
  }
  if (has('uncertain') && typeof entry.uncertain !== 'boolean') problems.push('uncertain must be true or false');
  if (has('uncertainReason')) {
    if (entry.uncertainReason !== null && typeof entry.uncertainReason !== 'string') {
      problems.push('uncertainReason must be a string or null');
    } else if (entry.uncertain === true && (entry.uncertainReason ?? '').trim() === '') {
      problems.push('uncertain is true, so uncertainReason must say why');
    } else if (entry.uncertain === false && entry.uncertainReason !== null) {
      problems.push('uncertain is false, so uncertainReason must be null');
    }
  }
  return problems;
}

/**
 * Checks a whole results file.
 * @param {unknown} results The parsed file: an array of `{ videoId, summary, guests, guestsUnnamed, uncertain, uncertainReason }`.
 * @param {Set<string>} known The ids in `sources.json`.
 * @returns {string[]} One line per bad entry, naming its position and id; empty when all are good.
 */
export function validateResults(results, known) {
  if (!Array.isArray(results)) return ['the file must hold a JSON array of results'];
  const seen = new Set();
  const lines = [];
  results.forEach((entry, index) => {
    const problems = entryProblems(entry, known);
    const id = isObject(entry) && typeof entry.videoId === 'string' ? entry.videoId : null;
    if (id !== null) {
      if (seen.has(id)) problems.push('this videoId appears more than once');
      seen.add(id);
    }
    if (problems.length > 0) lines.push(`entry ${index + 1}${id !== null ? ` (${id})` : ''}: ${problems.join('; ')}`);
  });
  return lines;
}

/**
 * Applies a results file to a data folder.
 * @param {object} args The inputs.
 * @param {string} args.dir The data folder; must hold `sources.json`.
 * @param {string} args.resultsPath The results file.
 * @param {Date} [args.now] Used for `episodes.json`'s `generatedAt` when it changes.
 * @returns {{ applied: number, added: number, redone: number, pending: number, episodesChanged: boolean }} How many results were applied, of which new and redone, how many episodes are still to do, and whether `episodes.json` changed.
 * @throws {Error} Naming every bad entry when any result is bad; nothing is written then.
 */
export function applyDetails({ dir, resultsPath, now = new Date() }) {
  const { sources } = readData(dir);
  const byId = new Map(sources.map((s) => [s.videoId, s]));
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const problems = validateResults(results, new Set(byId.keys()));
  if (problems.length > 0) {
    throw new Error(`Refusing ${resultsPath}: ${problems.length} bad ${problems.length === 1 ? 'entry' : 'entries'}, nothing written.\n  ${problems.join('\n  ')}`);
  }

  const detailsPath = join(dir, 'details.json');
  const episodes = { ...(readJson(detailsPath)?.episodes ?? {}) };
  let added = 0;
  for (const result of results) {
    const source = byId.get(result.videoId);
    if (!Object.hasOwn(episodes, result.videoId)) added += 1;
    episodes[result.videoId] = {
      summary: result.summary,
      guests: result.guests.map((g) => ({ name: g.name, affiliation: g.affiliation })),
      guestsUnnamed: result.guestsUnnamed,
      uncertain: result.uncertain,
      uncertainReason: result.uncertainReason,
      sourceHash: sourceHash(source.title, source.description),
    };
  }
  // Sorted by id so the file's diff shows what changed and not where it was inserted.
  const sorted = Object.fromEntries(Object.keys(episodes).sort().map((id) => [id, episodes[id]]));
  writeIfChanged(detailsPath, serialise({ version: 1, episodes: sorted }));

  const { changed } = rebuildEpisodes(dir, now);
  return {
    applied: results.length,
    added,
    redone: results.length - added,
    pending: pendingEpisodes({ sources, details: sorted }).length,
    episodesChanged: changed,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, resultsPath] = process.argv.slice(2);
  if (!dir || !resultsPath) {
    console.error('Usage: node src/apply-details.mjs <data-dir> <results.json>');
    process.exit(2);
  }
  try {
    const c = applyDetails({ dir, resultsPath });
    console.log(`Applied ${c.applied} (${c.added} new, ${c.redone} redone). Still to do: ${c.pending}. episodes.json: ${c.episodesChanged ? 'rebuilt' : 'unchanged'}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
