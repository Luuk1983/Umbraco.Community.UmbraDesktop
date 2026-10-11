import type { UmbraCoffeeData, UmbraCoffeeEpisode } from './types.js';

/**
 * The episode list that ships in the package, for when GitHub cannot be reached (design E6). It is
 * the version 2 `episodes.json`, written by `tools/umbracoffee-feed/` from the live file before
 * packing, never by hand, so it is only ever as old as the last release.
 *
 * It is loaded with a dynamic `import()`, so the bundler gives it a chunk of its own and only a store
 * whose first answer had no episode list ever fetches it (v2 plan, addendum 2026-10-01). Nothing else
 * may import the JSON statically: one static import anywhere in the bundle puts the whole archive back
 * into the chunk that imported it, the tray cup's included, and every desktop start pays for it.
 *
 * The window shows it under an offline notice ("Showing episodes up to ...") and the cup stays hidden,
 * so an old snapshot costs completeness, never a wrong reminder.
 * @param now Epoch ms by this browser's clock, stamped as the time it was "received".
 * @returns The data, offline, with nothing current. The list is a deep copy: a caller may change it
 *   freely. Rejects only when the chunk cannot be loaded, which the store survives.
 */
export async function snapshotData(now: number): Promise<UmbraCoffeeData> {
  const { default: snapshot } = await import('./snapshot/episodes.snapshot.json');
  return {
    episodes: (snapshot.episodes as UmbraCoffeeEpisode[]).map((episode) => ({
      ...episode,
      guests: episode.guests.map((guest) => ({ ...guest })),
    })),
    current: null,
    offline: true,
    episodesAsOf: snapshot.snapshotAt,
    receivedAt: now,
  };
}
