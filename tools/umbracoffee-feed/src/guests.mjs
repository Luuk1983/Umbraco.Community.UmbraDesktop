/**
 * Lists every guest name across the episodes with how many episodes it is in, and the pairs that
 * are probably one person spelled two ways, so the owner can fill `guestNames` in `overrides.json`.
 * It reads the names after the current map is applied, so a pair already mapped stops showing up.
 * Usage: `node src/guests.mjs <data-dir>`.
 * @module guests
 */
import { pathToFileURL } from 'node:url';
import { buildEpisodes, readData } from './build.mjs';

/**
 * A name reduced for comparison: accents stripped, lower case, single spaces.
 * @param {string} name The name as written.
 * @returns {string} The folded name.
 */
function fold(name) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Why two names are probably the same person, or null when nothing suggests it. The checks run in
 * order and the first that fits is the reason given.
 * @param {string} a One name.
 * @param {string} b Another name.
 * @returns {string|null} The reason, or null.
 */
function variantReason(a, b) {
  const fa = fold(a);
  const fb = fold(b);
  if (fa === fb) return 'same name apart from accents or case';
  const wa = fa.split(' ');
  const wb = fb.split(' ');
  if ((wa.length === 1 && wb.length > 1 && wb[0] === wa[0]) || (wb.length === 1 && wa.length > 1 && wa[0] === wb[0])) {
    return 'first name only';
  }
  if (wa.length > 1 && wb.length > 1 && wa.at(-1) === wb.at(-1) && wa[0][0] === wb[0][0]) {
    return 'same last name and first initial';
  }
  return null;
}

/**
 * Orders names by episode count, most first, then by name in code-point order so the output never
 * depends on the machine's locale.
 * @param {{name: string, count: number}} a One name.
 * @param {{name: string, count: number}} b Another.
 * @returns {number} The sort order.
 */
function byCountThenName(a, b) {
  if (a.count !== b.count) return b.count - a.count;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * Counts guest names per episode and finds likely variants.
 * @param {Array<{guests: Array<{name: string}>}>} episodes The built episodes.
 * @returns {{ names: Array<{name: string, count: number}>, variants: Array<{names: [string, string], reason: string}> }} Every distinct name with the number of episodes it is in, and each likely pair, the more frequent name first.
 */
export function guestReport(episodes) {
  const counts = new Map();
  for (const episode of episodes) {
    for (const name of new Set(episode.guests.map((g) => g.name))) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = [...counts].map(([name, count]) => ({ name, count })).sort(byCountThenName);
  const variants = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const reason = variantReason(names[i].name, names[j].name);
      if (reason) variants.push({ names: [names[i].name, names[j].name], reason });
    }
  }
  return { names, variants };
}

/**
 * Turns a report into the lines the command prints.
 * @param {ReturnType<typeof guestReport>} report The report.
 * @returns {string} Counts first, then the likely variants, ending in a newline.
 */
export function formatReport(report) {
  const counts = new Map(report.names.map((n) => [n.name, n.count]));
  const width = String(report.names[0]?.count ?? 0).length;
  const lines = [`Guests (${report.names.length}):`];
  for (const { name, count } of report.names) lines.push(`${String(count).padStart(width + 2)}  ${name}`);
  lines.push('', report.variants.length > 0 ? 'Likely variants:' : 'No likely variants.');
  for (const { names: [a, b], reason } of report.variants) lines.push(`  ${a} (${counts.get(a)}) / ${b} (${counts.get(b)}): ${reason}`);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node src/guests.mjs <data-dir>');
    process.exit(2);
  }
  process.stdout.write(formatReport(guestReport(buildEpisodes(readData(dir)))));
}
