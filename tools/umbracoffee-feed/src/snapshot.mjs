/**
 * Writes the episode list the package ships, for when GitHub cannot be reached (design E6). Since
 * `episodes.json` version 2 carries summaries and no descriptions, the snapshot is that file whole:
 * there is nothing left worth trimming.
 * Usage: `node src/snapshot.mjs <episodes.json> [output]`.
 * @module snapshot
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { iso, serialise } from './files.mjs';

/** Where the client imports the snapshot from, relative to this file. */
const DEFAULT_OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../src/Umbraco.Community.UmbraDesktop.Entertainment/backoffice/src/umbracoffee/snapshot/episodes.snapshot.json',
);

/**
 * Builds the snapshot from an episodes file. `snapshotAt` is the file's own `generatedAt`, so the
 * app's "showing episodes up to" date is the data's age rather than the moment someone ran the
 * tool, and re-running over the same file gives the same bytes.
 * @param {{version: number, generatedAt?: string, episodes: import('./build.mjs').BuiltEpisode[]}} episodesFile The parsed `episodes.json`.
 * @param {Date} [now] Used only when the file has no `generatedAt`.
 * @returns {{version: number, snapshotAt: string, episodes: import('./build.mjs').BuiltEpisode[]}} The snapshot, version 2 like its source, with every field copied.
 * @throws {Error} When the file is not version 2: a v1 file would ship descriptions the app no longer reads and no summaries.
 */
export function buildSnapshot(episodesFile, now = new Date()) {
  if (episodesFile.version !== 2) throw new Error(`Expected episodes.json version 2, got version ${episodesFile.version}`);
  return {
    version: 2,
    snapshotAt: episodesFile.generatedAt ?? iso(now),
    episodes: episodesFile.episodes.map((e) => ({
      videoId: e.videoId,
      title: e.title,
      published: e.published,
      summary: e.summary,
      guests: e.guests.map((g) => ({ name: g.name, affiliation: g.affiliation })),
      guestsUnnamed: e.guestsUnnamed,
      uncertain: e.uncertain,
    })),
  };
}

/**
 * Reads an `episodes.json` and writes the snapshot file next to the client code that imports it.
 * @param {string} input Path of `episodes.json`.
 * @param {string} [output] Path to write; defaults to the client's snapshot location.
 */
export function writeSnapshot(input, output = DEFAULT_OUTPUT) {
  const snapshot = buildSnapshot(JSON.parse(readFileSync(input, 'utf8')));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, serialise(snapshot));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error('Usage: node src/snapshot.mjs <episodes.json> [output]');
    process.exit(2);
  }
  writeSnapshot(input, output);
  console.log(`Snapshot written to ${output ?? DEFAULT_OUTPUT}`);
}
