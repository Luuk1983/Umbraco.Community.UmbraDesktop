/**
 * What `run`, `pending`, `apply-details` and `backfill` share: the source hash that says whether an
 * episode's details are current, and the build of the `episodes.json` the app reads from the three
 * files beside it (design addendum 2026-10-01).
 * @module build
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { iso, readJson, serialise, writeIfChanged } from './files.mjs';

/**
 * One entry of `sources.json`: what the feed and the backfill know about a video.
 * @typedef {object} Source
 * @property {string} videoId The YouTube video id.
 * @property {string} title The title without the channel prefix.
 * @property {string} published The upload moment, UTC ISO.
 * @property {string} description The full description, empty for a backfilled episode.
 */

/**
 * A guest as the app shows it.
 * @typedef {object} Guest
 * @property {string} name The person's name.
 * @property {string|null} affiliation One company or short role, or null.
 */

/**
 * One entry of `details.json`, written by `apply-details` from the prompt's answer.
 * @typedef {object} Detail
 * @property {string} summary Two or three sentences, or empty.
 * @property {Guest[]} guests The guests the description names.
 * @property {boolean} guestsUnnamed True when the description says there are guests but names none.
 * @property {boolean} uncertain True when a person should check the answer.
 * @property {string|null} uncertainReason Why, when `uncertain`.
 * @property {string} sourceHash {@link sourceHash} of the source the answer was made from.
 */

/**
 * The owner's hand-written corrections. Never written by a tool.
 * @typedef {object} Overrides
 * @property {number} [version] Always 1.
 * @property {Record<string, string>} [guestNames] A spelling as written mapped to the one name it means, so one person is one entry in the guest filter.
 * @property {Record<string, {summary?: string, guests?: Array<{name: string, affiliation?: string|null}>, guestsUnnamed?: boolean}>} [episodes] Per-episode fields that win over `details.json`.
 */

/**
 * One entry of `episodes.json` version 2, what the app reads.
 * @typedef {object} BuiltEpisode
 * @property {string} videoId The video id.
 * @property {string} title The title.
 * @property {string} published The upload moment, UTC ISO.
 * @property {string} summary The summary, empty when there is none yet.
 * @property {Guest[]} guests The guests, after the name map.
 * @property {boolean} guestsUnnamed Whether there were guests nobody named.
 * @property {boolean} uncertain Whether the details want checking.
 */

/**
 * Fingerprints the text the details were made from. When a title or description is edited on
 * YouTube the hash moves, and the episode is to do again.
 * @param {string} title The stored (prefix-free) title.
 * @param {string} description The stored description.
 * @returns {string} The first 16 hex characters of SHA-256 over `title + "\n" + description`.
 */
export function sourceHash(title, description) {
  return createHash('sha256').update(`${title}\n${description}`, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Whether an episode needs the prompt run (again): it has no details, or they were made from text
 * that has since changed.
 * @param {Source} source The episode as it is now.
 * @param {Detail|undefined} detail Its entry in `details.json`, if any.
 * @returns {boolean} True when it is to do.
 */
export function isPending(source, detail) {
  return !detail || detail.sourceHash !== sourceHash(source.title, source.description);
}

/**
 * Copies a guest with a fixed key order, so equal data is byte-equal data.
 * @param {{name: string, affiliation?: string|null}} guest A guest from details or overrides.
 * @returns {Guest} The normalised guest.
 */
function toGuest(guest) {
  return { name: guest.name, affiliation: guest.affiliation ?? null };
}

/**
 * Applies the owner's name map and drops a guest that has become a second copy of one already in
 * the list. When the first copy has no affiliation and the dropped one has, the first takes it, so
 * mapping a bare "Jesper" onto "Jesper Mayntzhusen" never loses what the fuller entry said.
 * @param {Guest[]} guests The merged guests of one episode.
 * @param {Record<string, string>} names Variant as written mapped to the canonical name; exact match only.
 * @returns {Guest[]} The guests with canonical names, each name once.
 */
function canonicalGuests(guests, names) {
  const result = [];
  for (const guest of guests) {
    const name = Object.hasOwn(names, guest.name) ? names[guest.name] : guest.name;
    const already = result.find((g) => g.name === name);
    if (already) {
      if (already.affiliation === null) already.affiliation = guest.affiliation;
      continue;
    }
    result.push({ name, affiliation: guest.affiliation });
  }
  return result;
}

/**
 * Builds the app's episode list. The order is `sources.json`'s. For each field the owner's
 * override wins, then `details.json`, then the empty default; a stale details entry still counts,
 * because lagging until the next local run is fine for a monthly show. `uncertain` is not an
 * override field, so it always comes from details.
 * @param {object} args The three inputs.
 * @param {Source[]} args.sources The episodes, newest first.
 * @param {Record<string, Detail>} [args.details] `details.json`'s `episodes`.
 * @param {Overrides|null} [args.overrides] The whole `overrides.json`.
 * @returns {BuiltEpisode[]} The v2 entries.
 */
export function buildEpisodes({ sources, details = {}, overrides = null }) {
  const byEpisode = overrides?.episodes ?? {};
  const names = overrides?.guestNames ?? {};
  return sources.map((source) => {
    const detail = details[source.videoId];
    const override = byEpisode[source.videoId] ?? {};
    const guests = (override.guests ?? detail?.guests ?? []).map(toGuest);
    return {
      videoId: source.videoId,
      title: source.title,
      published: source.published,
      summary: override.summary ?? detail?.summary ?? '',
      guests: canonicalGuests(guests, names),
      guestsUnnamed: override.guestsUnnamed ?? detail?.guestsUnnamed ?? false,
      uncertain: detail?.uncertain ?? false,
    };
  });
}

/**
 * The episodes the prompt still has to see, in the shape it expects as input.
 * @param {object} args The inputs.
 * @param {Source[]} args.sources The episodes.
 * @param {Record<string, Detail>} [args.details] `details.json`'s `episodes`.
 * @returns {Array<{videoId: string, title: string, date: string, description: string}>} The to-do episodes, newest first, `date` as `YYYY-MM-DD` in UTC.
 */
export function pendingEpisodes({ sources, details = {} }) {
  return sources
    .filter((source) => isPending(source, details[source.videoId]))
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
    .map((source) => ({
      videoId: source.videoId,
      title: source.title,
      date: source.published.slice(0, 10),
      description: source.description,
    }));
}

/**
 * Reads the three input files of a data folder. Only `sources.json` is required.
 * @param {string} dir The data folder.
 * @returns {{ sources: Source[], details: Record<string, Detail>, overrides: Overrides|null }} The parsed inputs.
 * @throws {Error} When the folder has no `sources.json`.
 */
export function readData(dir) {
  const sourcesFile = readJson(join(dir, 'sources.json'));
  if (!sourcesFile) throw new Error(`No sources.json in ${dir}`);
  return {
    sources: sourcesFile.episodes,
    details: readJson(join(dir, 'details.json'))?.episodes ?? {},
    overrides: readJson(join(dir, 'overrides.json')),
  };
}

/**
 * Rebuilds `episodes.json` from the folder's other files. `generatedAt` only moves when the
 * episodes themselves changed, so a rebuild over unchanged inputs writes nothing and the Action
 * commits nothing.
 * @param {string} dir The data folder.
 * @param {Date} now Used for `generatedAt` when the content changed.
 * @returns {{ changed: boolean, episodes: BuiltEpisode[] }} Whether the file was written, and its entries.
 */
export function rebuildEpisodes(dir, now) {
  const path = join(dir, 'episodes.json');
  const episodes = buildEpisodes(readData(dir));
  const previous = readJson(path);
  const same = previous?.version === 2 && JSON.stringify(previous.episodes) === JSON.stringify(episodes);
  const file = { version: 2, generatedAt: same ? previous.generatedAt : iso(now), episodes };
  return { changed: writeIfChanged(path, serialise(file)), episodes };
}
