/**
 * Prints the episodes whose details are to do (none yet, or made from text that has since changed),
 * as the JSON array `prompts/episode-details.md` takes as input. Run locally before a details session.
 * Usage: `node src/pending.mjs <data-dir> > pending.json`.
 * @module pending
 */
import { pathToFileURL } from 'node:url';
import { pendingEpisodes, readData } from './build.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node src/pending.mjs <data-dir>');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(pendingEpisodes(readData(dir)), null, 2) + '\n');
}
