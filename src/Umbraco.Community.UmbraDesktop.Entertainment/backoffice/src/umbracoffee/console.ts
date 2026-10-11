/**
 * @file umbraCoffee's console commands: `umbraCoffee.simulate('upcoming', 8)` and the rest, typed in
 * the browser's developer console, or called by a browser test through `page.evaluate`.
 *
 * They exist because the feed cannot be made to say "starts in eight minutes" or "live now" on
 * demand: the show is monthly, and faking the files by hand in DevTools takes six steps and a UTC
 * sum. Each command swaps the store's feed for a stand-in through {@link UmbraCoffeeStore.simulate},
 * so what follows is the real path: the schedule decides, the window, the cup and the reminders
 * react, exactly as they would to GitHub's files. A simulation lives in this page only and ends on
 * `reset()` or a reload; nothing is stored and nothing is sent anywhere.
 */

import type { UmbraCoffeeFeedResult } from './feed.js';
import { REMINDED_STORAGE_KEY } from './reminder-record.js';
import { umbraCoffeeStore, type UmbraCoffeeStore } from './store.js';
import type { UmbraCoffeeCurrent } from './types.js';

/** What `simulate` can pretend. */
export type UmbraCoffeeSimulatedState = 'upcoming' | 'live' | 'none' | 'offline';

/** Every state `simulate` knows, in the order `help` lists them. */
const STATES: ReadonlyArray<UmbraCoffeeSimulatedState> = ['upcoming', 'live', 'none', 'offline'];

/** How far ahead an upcoming episode starts when no minutes are given: inside the ten-minute reminder. */
const DEFAULT_MINUTES = 8;

/** What `status` reports: what the app believes now, and whether that is a simulation. */
export interface UmbraCoffeeConsoleStatus {
  /** The simulated state, or null when the real feed is in use. */
  simulating: UmbraCoffeeSimulatedState | null;
  /** Whether the app thinks the feed is unreachable. */
  offline: boolean;
  /** The upcoming or live episode the app holds, if any. */
  current: Pick<UmbraCoffeeCurrent, 'videoId' | 'title' | 'state' | 'scheduledStart'> | null;
  /** How many episodes the list holds. */
  episodes: number;
}

/** The commands, as `window.umbraCoffee` carries them. */
export interface UmbraCoffeeConsole {
  /** @returns The commands, one per line. */
  help(): string;
  /**
   * Pretend the feed says something.
   * @param state `upcoming`, `live`, `none` (nothing coming up) or `offline` (unreachable).
   * @param minutesOrVideoId For `upcoming`: how far ahead it starts, eight by default, inside the
   *   reminder. Or a real YouTube video id, for `live` especially: then the player and the live chat
   *   are real, where the simulated id is no video at all.
   * @param videoId For `upcoming` with minutes: a real YouTube video id.
   * @returns What was set, or why nothing was.
   */
  simulate(state: UmbraCoffeeSimulatedState, minutesOrVideoId?: number | string, videoId?: string): string;
  /** @returns Confirmation. Goes back to the real feed. */
  reset(): string;
  /** @returns Confirmation. Lets every reminder show again in this browser. */
  forgetReminders(): string;
  /** @returns What the app believes now. */
  status(): UmbraCoffeeConsoleStatus;
}

/** What the commands need besides the store, injectable so a test drives the clock and storage. */
export interface UmbraCoffeeConsoleEnvironment {
  /** The time, epoch ms. */
  now(): number;
  /** Where the reminder record is kept; looked up when called, since blocked storage throws on access. */
  storage(): Pick<Storage, 'removeItem'> | undefined;
}

/** The browser's clock and `localStorage`. */
const browserConsoleEnvironment: UmbraCoffeeConsoleEnvironment = {
  now: () => Date.now(),
  storage: () => globalThis.localStorage,
};

/**
 * A time as the files write it: ISO, UTC, no milliseconds.
 * @param ms Epoch ms.
 * @returns The ISO string.
 */
const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Build the commands over a store.
 * @param store The store to drive; the shared one in the app.
 * @param env Clock and storage; the browser's unless a test passes its own.
 * @returns The commands.
 */
export function createConsole(
  store: UmbraCoffeeStore,
  env: UmbraCoffeeConsoleEnvironment = browserConsoleEnvironment,
): UmbraCoffeeConsole {
  let simulating: UmbraCoffeeSimulatedState | null = null;

  /**
   * The two files a feed would return with `episode` as the next episode: the list the store already
   * holds, and a next-episode file stamped at the moment of each poll, so the schedule keeps trusting
   * it however long the simulation runs.
   * @param episode The next episode, or null.
   * @returns A stand-in fetcher.
   */
  const feedWith = (episode: UmbraCoffeeCurrent | null) => async (): Promise<UmbraCoffeeFeedResult> => {
    const held = store.value;
    return {
      episodes: { version: 2, generatedAt: held?.episodesAsOf ?? iso(env.now()), episodes: held?.episodes ?? [] },
      next: { version: 1, updatedAt: iso(env.now()), episode },
    };
  };

  return {
    help: () =>
      [
        "umbraCoffee.simulate('upcoming', 8)  an episode starting in 8 minutes (a reminder is due inside 10)",
        "umbraCoffee.simulate('live')         an episode live now",
        "umbraCoffee.simulate('live', '<id>') the same with a real YouTube video id, for a real player and chat",
        "umbraCoffee.simulate('none')         nothing coming up",
        "umbraCoffee.simulate('offline')      the feed unreachable",
        'umbraCoffee.reset()                  back to the real feed',
        'umbraCoffee.forgetReminders()        let reminders show again in this browser',
        'umbraCoffee.status()                 what the app believes now',
      ].join('\n'),

    simulate(state, minutesOrVideoId, videoId) {
      if (!STATES.includes(state)) return `Unknown state. Use one of: ${STATES.join(', ')}.`;
      const minutes = typeof minutesOrVideoId === 'number' ? minutesOrVideoId : DEFAULT_MINUTES;
      const realId = typeof minutesOrVideoId === 'string' ? minutesOrVideoId : videoId;
      // Fixed now, not at each poll: a start that moved with the clock would never arrive. Without a
      // real id each simulation gets its own, since a reminder shows once per episode and a second
      // run of the same test must see it again; with one, `forgetReminders()` shows it again.
      const at = env.now();
      const id = realId ?? `simulated-${state}-${at}`;
      if (state === 'offline') store.simulate(async () => ({}));
      else if (state === 'none') store.simulate(feedWith(null));
      else if (state === 'upcoming') {
        const start = iso(at + minutes * 60_000);
        store.simulate(feedWith({ videoId: id, title: 'Simulated episode', state, scheduledStart: start, actualStart: null }));
      } else store.simulate(feedWith({ videoId: id, title: 'Simulated episode', state, scheduledStart: iso(at), actualStart: iso(at) }));
      simulating = state;
      return state === 'upcoming' ? `Simulating an episode starting in ${minutes} min.` : `Simulating: ${state}.`;
    },

    reset() {
      store.simulate(undefined);
      simulating = null;
      return 'Back to the real feed.';
    },

    forgetReminders() {
      try {
        env.storage()?.removeItem(REMINDED_STORAGE_KEY);
      } catch {
        return 'Could not reach this browser’s storage, so nothing was forgotten.';
      }
      // The cup also remembers in memory what it raised in this page, for when storage is blocked;
      // simulated episodes get fresh ids, so only a real episode needs the reload.
      return 'Reminders forgotten. Reload the page to see a real episode’s reminder again.';
    },

    status() {
      const data = store.value;
      const current = data?.current;
      return {
        simulating,
        offline: data?.offline ?? true,
        current: current
          ? { videoId: current.videoId, title: current.title, state: current.state, scheduledStart: current.scheduledStart ?? null }
          : null,
        episodes: data?.episodes.length ?? 0,
      };
    },
  };
}

/**
 * Put the commands on `window.umbraCoffee`, once. Called by the elements that subscribe to the
 * store (the cup, the window), so the commands exist on every desktop where umbraCoffee runs. A
 * second call keeps the first, so the cup and the window share one set and one `simulating` state.
 * @param target Where to put them; the page's global unless a test passes an object.
 * @param store The store they drive; the shared one unless a test passes its own.
 */
export function installConsole(target: object = globalThis, store: UmbraCoffeeStore = umbraCoffeeStore): void {
  const holder = target as { umbraCoffee?: UmbraCoffeeConsole };
  if (holder.umbraCoffee) return;
  holder.umbraCoffee = createConsole(store);
}
