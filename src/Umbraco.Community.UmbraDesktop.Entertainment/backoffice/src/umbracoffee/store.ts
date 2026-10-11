import {
  UMBRACOFFEE_ACTIVE_WINDOW_MS,
  UMBRACOFFEE_POLL_ACTIVE_MS,
  UMBRACOFFEE_POLL_IDLE_MS,
} from './constants.js';
import { fetchFeed, type UmbraCoffeeFeedResult, type UmbraCoffeeFetcher } from './feed.js';
import { snapshotData } from './snapshot.js';
import type { UmbraCoffeeData } from './types.js';

export type { UmbraCoffeeFeedResult, UmbraCoffeeFetcher } from './feed.js';

/** Called with each set of data the store accepts. */
export type UmbraCoffeeListener = (data: UmbraCoffeeData) => void;

/**
 * Loads the shipped episode list, stamped with a receipt time. `snapshot.ts`'s, which is a dynamic
 * import, except for whatever a test passes in its place to count or fail the load.
 */
export type UmbraCoffeeSnapshotLoader = (now: number) => Promise<UmbraCoffeeData>;

/**
 * The timers and the clock the store and the window run on, injectable so a test decides when time
 * passes. The store chains timeouts, because its delay changes with what is coming up; the window
 * runs an interval for its countdown.
 */
export interface UmbraCoffeeStoreEnvironment {
  /** Starts a repeating timer (the window's countdown). */
  setInterval(fn: () => void, ms: number): number;
  /** Stops it. */
  clearInterval(id: number): void;
  /** Starts a one-shot timer (the store's next poll). */
  setTimeout(fn: () => void, ms: number): number;
  /** Stops it. */
  clearTimeout(id: number): void;
  /** The time data is stamped with, epoch ms. */
  now(): number;
}

/**
 * The browser's own timers and clock, which the shared store runs on. Exported for the window, which
 * runs its countdown on the same shape so a test can drive both.
 */
export const browserEnvironment: UmbraCoffeeStoreEnvironment = {
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  now: () => Date.now(),
};

/**
 * How long to wait before the next poll (design E5): every minute while an episode is live or is
 * upcoming within {@link UMBRACOFFEE_ACTIVE_WINDOW_MS} of its start (or already past it and not live
 * yet, which is when the switch to live is expected), otherwise every half hour. **Offline is idle**:
 * a host that is blocked or down is not asked more often for being interesting.
 * @param data What the store holds.
 * @param now Epoch ms.
 * @returns The delay in ms.
 */
export function pollDelay(data: UmbraCoffeeData, now: number): number {
  const current = data.offline ? null : data.current;
  if (!current) return UMBRACOFFEE_POLL_IDLE_MS;
  if (current.state === 'live') return UMBRACOFFEE_POLL_ACTIVE_MS;
  const start = Date.parse(current.scheduledStart ?? '');
  if (Number.isNaN(start)) return UMBRACOFFEE_POLL_IDLE_MS;
  return start - now < UMBRACOFFEE_ACTIVE_WINDOW_MS ? UMBRACOFFEE_POLL_ACTIVE_MS : UMBRACOFFEE_POLL_IDLE_MS;
}

/**
 * One poller per desktop document (first design §4): the cup, the reminders and every open umbraCoffee
 * window read this, so nothing polls twice. It polls only while something listens, which means only
 * while the tray item is switched on or a window is open.
 *
 * It reads the two files on the data branch from the browser (design E2), so it is not tied to the
 * Umbraco session: there is no poll gate, and a poll never refreshes a token (design E10).
 *
 * A class rather than a Umbraco context because everything that reads it is this package's own and
 * lives in the same document, so a module-level instance is already shared, and a context would add
 * a provider the host would have to know about.
 *
 * Each accepted set of data is stamped with `receivedAt` by this browser's clock. When either file is
 * missing the data says `offline`, hides `current` (nothing is believed that could not be confirmed)
 * and keeps the last good episode list, else the snapshot's, so the window always has something to
 * show. The store never withholds data for its age: what is too old for a countdown is the schedule's
 * job to decide.
 *
 * The snapshot is loaded only at that last step, the one answer that has no episode list and nothing
 * held to fall back on, so a desktop whose first poll succeeds never downloads it.
 */
export class UmbraCoffeeStore {
  /** The latest data. Kept across failed polls, so a blip does not blank the window's list. */
  #value?: UmbraCoffeeData;

  /**
   * Who listens, one entry per subscription. Keyed by a token rather than a set of functions, so the
   * same function subscribed twice is two subscriptions, and ending one leaves the other.
   */
  #listeners = new Map<symbol, UmbraCoffeeListener>();

  /** The next poll's timeout, while one is waiting. */
  #timer?: number;

  /** Whether the poll chain is running: from the first listener to the last one leaving. */
  #running = false;

  /**
   * Which run of the chain is current. A request still in flight when the last listener leaves must
   * not start a timer for a chain that has ended, and one from an ended run must not start a second
   * chain beside the run that began after it.
   */
  #epoch = 0;

  /** The fetch in flight, so tests and callers can await it. Never rejects. */
  #inflight: Promise<void> = Promise.resolve();

  /** The timers and clock in use. */
  readonly #env: UmbraCoffeeStoreEnvironment;

  /**
   * A stand-in feed asked in place of the real one while set; see {@link simulate}. Undefined is
   * the real feed.
   */
  #simulation?: UmbraCoffeeFetcher;

  /**
   * Creates an idle store: nothing is fetched and no timer runs until the first subscriber.
   * @param fetcher Reads the two files.
   * @param env Timers and clock; the browser's, except for whatever a test passes in their place.
   * @param snapshot Loads the shipped list when nothing better is to hand; `snapshot.ts`'s by default.
   */
  constructor(
    private readonly fetcher: UmbraCoffeeFetcher,
    env: Partial<UmbraCoffeeStoreEnvironment> = {},
    private readonly snapshot: UmbraCoffeeSnapshotLoader = snapshotData,
  ) {
    this.#env = { ...browserEnvironment, ...env };
  }

  /** The latest data, if any has come. */
  public get value(): UmbraCoffeeData | undefined {
    return this.#value;
  }

  /** Resolves when the fetch in flight has finished. */
  public get settled(): Promise<void> {
    return this.#inflight;
  }

  /**
   * Listen. The first listener starts polling. A listener that arrives when data is held gets it at
   * once; one that arrives when nobody was listening also makes the store ask again, since what it
   * holds may be hours old.
   * @param listener Called with each new set of data.
   * @returns Stops this subscription; the last one to stop stops the polling.
   */
  public subscribe(listener: UmbraCoffeeListener): () => void {
    const token = Symbol('umbraCoffee subscription');
    this.#listeners.set(token, listener);
    if (this.#value) this.#tell(listener, this.#value);
    if (!this.#running) {
      this.#running = true;
      this.#refresh(++this.#epoch);
    }
    return () => {
      this.#listeners.delete(token);
      if (this.#listeners.size === 0 && this.#running) {
        this.#running = false;
        this.#epoch++;
        if (this.#timer !== undefined) this.#env.clearTimeout(this.#timer);
        this.#timer = undefined;
      }
    };
  }

  /**
   * Ask a stand-in feed instead of the real one, at once and on every poll after, until cleared.
   *
   * Exists for testing what the feed cannot be made to say on demand: an episode about to start, a
   * live stream, the feed unreachable. The console commands in `console.ts` build the stand-ins, so a
   * person and a browser test drive the same path the real data takes, through the schedule, the
   * window, the cup and the reminders. Nothing in the app calls it.
   *
   * The running chain restarts, so the change shows now rather than at the next poll, up to 30
   * minutes away. With nobody listening it is only held, and the first listener asks it.
   * @param fetcher The stand-in, or undefined to go back to the real feed.
   */
  public simulate(fetcher: UmbraCoffeeFetcher | undefined): void {
    this.#simulation = fetcher;
    if (!this.#running) return;
    if (this.#timer !== undefined) this.#env.clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#refresh(++this.#epoch);
  }

  /**
   * Hand one listener some data. Guarded, so a listener that throws cannot stop the others hearing
   * or leave {@link settled} rejected.
   * @param listener The listener.
   * @param data The data.
   */
  #tell(listener: UmbraCoffeeListener, data: UmbraCoffeeData): void {
    try {
      listener(data);
    } catch (error) {
      console.error('[umbraCoffee] a store listener threw', error);
    }
  }

  /**
   * Turns what a fetch returned into what the store holds. Both files means online, from the files.
   * Anything less means offline, with `current` dropped and with the episode list from the episodes
   * file when that alone arrived, else the last good list, else the snapshot's. Asynchronous only
   * because of that last case, which loads the snapshot's chunk; a snapshot that cannot be loaded
   * (a deploy that removed the chunk under an open page, say) leaves an empty list rather than no
   * answer, so the listeners still hear "offline" and the chain still schedules its next poll.
   * @param result What the fetch returned.
   * @param now Epoch ms, the receipt time.
   * @returns The data.
   */
  async #merge(result: UmbraCoffeeFeedResult, now: number): Promise<UmbraCoffeeData> {
    const { episodes, next } = result;
    if (episodes && next) {
      const updatedAt = Date.parse(next.updatedAt);
      return {
        episodes: episodes.episodes,
        current: next.episode,
        ...(Number.isNaN(updatedAt) ? {} : { currentUpdatedAt: updatedAt }),
        offline: false,
        episodesAsOf: episodes.generatedAt,
        receivedAt: now,
      };
    }
    if (episodes) {
      return { episodes: episodes.episodes, current: null, offline: true, episodesAsOf: episodes.generatedAt, receivedAt: now };
    }
    const held = this.#value ?? (await this.#loadSnapshot(now));
    return { episodes: held.episodes, current: null, offline: true, episodesAsOf: held.episodesAsOf, receivedAt: now };
  }

  /**
   * The shipped list, or an empty offline answer when its chunk will not load. Never rejects, so a
   * failed load cannot stall the poll chain.
   * @param now Epoch ms, the receipt time.
   * @returns The data to fall back on.
   */
  async #loadSnapshot(now: number): Promise<UmbraCoffeeData> {
    try {
      return await this.snapshot(now);
    } catch (error) {
      console.error('[umbraCoffee] the shipped episode list could not be loaded', error);
      return { episodes: [], current: null, offline: true, episodesAsOf: null, receivedAt: now };
    }
  }

  /**
   * Fetch once, stamp it, tell everyone, and if this run of the chain is still the current one,
   * schedule the next poll with {@link pollDelay}. A fetcher that throws counts as a failed fetch
   * too, so no rejection escapes into the page and the chain never stalls.
   * @param epoch The run of the chain this fetch belongs to.
   */
  #refresh(epoch: number): void {
    // A fetcher that throws before it returns a promise counts as a failure too.
    let request: Promise<UmbraCoffeeFeedResult>;
    try {
      request = (this.#simulation ?? this.fetcher)();
    } catch {
      request = Promise.resolve({});
    }
    this.#inflight = request
      .catch((): UmbraCoffeeFeedResult => ({}))
      .then(async (result) => {
        const now = this.#env.now();
        const data = await this.#merge(result, now);
        this.#value = data;
        for (const listener of [...this.#listeners.values()]) this.#tell(listener, data);
        if (epoch !== this.#epoch || !this.#running) return;
        this.#timer = this.#env.setTimeout(() => {
          this.#timer = undefined;
          this.#refresh(epoch);
        }, pollDelay(data, now));
      });
  }
}

/**
 * The store every umbraCoffee element in this document shares. Idle until the first subscriber.
 */
export const umbraCoffeeStore = new UmbraCoffeeStore(fetchFeed);
