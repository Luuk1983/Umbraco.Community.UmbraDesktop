import type { UmbraDesktopApp } from '../types';

/**
 * How well a name matches: 0 when it starts with the query, 1 when one of its words does, 2 when it
 * only contains it, and -1 for no match. The order Windows and macOS rank app names in, so "log"
 * finds Log Viewer before a name that merely has "log" somewhere inside it.
 * @param name The name, lowercased.
 * @param query The query, lowercased and trimmed.
 * @returns The rank.
 */
function rankOf(name: string, query: string): number {
  if (name.startsWith(query)) return 0;
  if (name.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query))) return 1;
  return name.includes(query) ? 2 : -1;
}

/**
 * The apps matching a query, best first and alphabetical within a rank. Local and instant: apps
 * are already in memory, so they show on the first keystroke while the server sources wait for
 * the debounce.
 * @param apps Every app the user may open.
 * @param nameOf The app's translated name, which is what the user sees and types.
 * @param query What was typed.
 * @returns The matching apps, ranked.
 */
export function rankApps(
  apps: ReadonlyArray<UmbraDesktopApp>,
  nameOf: (app: UmbraDesktopApp) => string,
  query: string,
): UmbraDesktopApp[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  return apps
    .map((app) => ({ app, name: nameOf(app), rank: rankOf(nameOf(app).toLocaleLowerCase(), q) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map((entry) => entry.app);
}
