/**
 * What the umbraCoffee element tests share: data to hand a store, a clock and timers the test
 * drives, a store over fixed data, a stand-in for the backoffice's auth context, a stand-in for
 * the desktop the tray cup and the reminder sit in, a stand-in for the desktop's settings context, a
 * `localStorage` stand-in, and a way to mount an element in a box of an exact size.
 *
 * Imported only by tests. It is not a `*.test.ts` file, so the runner does not run it as one, and
 * nothing in the bundle imports it, so the build leaves it out; `tsc` still type-checks it with the
 * rest of `src`. The window's, the cup's, the reminder's and the record's tests all use it, which is
 * why it is not inside any one test file.
 */

import { UMBRADESKTOP_SETTINGS_CONTEXT, type UmbraDesktopSettingsContextLike } from './desktop-format.js';
import type { ReminderStorage } from './reminder-record.js';
import type { UmbraCoffeeFeedResult, UmbraCoffeeFetcher } from './feed.js';
import type { UmbraCoffeeStoreEnvironment } from './store.js';
import { UmbraCoffeeStore } from './store.js';
import { UMBRADESKTOP_TRAY_CONTEXT, type UmbraDesktopTrayContextLike } from './tray-context.js';
import type { UmbraCoffeeData, UmbraCoffeeEpisode } from './types.js';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import {
  UMB_NOTIFICATION_CONTEXT,
  type UmbNotificationColor,
  type UmbNotificationContext,
  type UmbNotificationOptions,
} from '@umbraco-cms/backoffice/notification';
import { UmbStringState } from '@umbraco-cms/backoffice/observable-api';

/** One minute, in ms. */
export const MINUTE = 60_000;

/** The moment every test clock starts at, so a countdown is worked out from a known "now". */
export const T0 = Date.parse('2026-10-30T11:00:00Z');

/**
 * A whole version 2 episode from the fields a case cares about: no summary, no guests and nothing
 * uncertain unless it says otherwise, so a case names only what it is about.
 * @param over The id, title and date, and any other field to set.
 * @returns The episode.
 */
export const episodeOf = (
  over: Pick<UmbraCoffeeEpisode, 'videoId' | 'title' | 'published'> & Partial<UmbraCoffeeEpisode>,
): UmbraCoffeeEpisode => ({ summary: '', guests: [], guestsUnnamed: false, uncertain: false, ...over });

/** The episodes the data carries: three, newest first. */
export const EPISODES: UmbraCoffeeEpisode[] = [
  episodeOf({ videoId: 'v0', title: 'September', published: '2026-09-25T11:27:38Z' }),
  episodeOf({ videoId: 'v2', title: 'August', published: '2026-08-28T11:30:00Z' }),
  episodeOf({ videoId: 'v3', title: 'July', published: '2026-07-31T11:30:00Z' }),
];

/**
 * Data with nothing current and {@link EPISODES} in the list, online, received and confirmed at
 * {@link T0}, with any field overridden.
 * @param over Fields to replace.
 * @returns The data.
 */
export const answer = (over: Partial<UmbraCoffeeData> = {}): UmbraCoffeeData => ({
  episodes: EPISODES,
  current: null,
  currentUpdatedAt: T0,
  offline: false,
  episodesAsOf: new Date(T0).toISOString(),
  receivedAt: T0,
  ...over,
});

/**
 * October, live now.
 * @param over Fields to replace, `currentUpdatedAt` for instance.
 * @returns The data.
 */
export const live = (over: Partial<UmbraCoffeeData> = {}) =>
  answer({
    current: { videoId: 'v1', title: 'October', state: 'live', scheduledStart: null, actualStart: new Date(T0).toISOString() },
    ...over,
  });

/**
 * October, starting 25 minutes after {@link T0}, less a second, so the rounded-up countdown reads
 * exactly 25 at T0.
 * @param over Fields to replace.
 * @returns The data.
 */
export const upcoming = (over: Partial<UmbraCoffeeData> = {}) =>
  answer({
    current: {
      videoId: 'v1',
      title: 'October',
      state: 'upcoming',
      scheduledStart: new Date(T0 + 25 * MINUTE - 1000).toISOString(),
    },
    ...over,
  });

/**
 * What the store holds when GitHub cannot be reached: the episodes it has, nothing current, `offline`.
 * @param over Fields to replace.
 * @returns The data.
 */
export const offline = (over: Partial<UmbraCoffeeData> = {}) =>
  answer({ current: null, currentUpdatedAt: undefined, offline: true, ...over });

/**
 * The two files a fetch would have returned for some data, so a store over fixed data behaves as it
 * would over the real feed. Offline data comes back as the episodes file alone: the next-episode file
 * is what "unreachable" is missing, and the store then keeps the episodes it was given.
 * @param data The data to serve.
 * @param now The time an `updatedAt` defaults to when the data has none.
 * @returns The feed result.
 */
export function feedOf(data: UmbraCoffeeData, now: number): UmbraCoffeeFeedResult {
  const episodes = {
    version: 2 as const,
    generatedAt: data.episodesAsOf ?? new Date(now).toISOString(),
    episodes: data.episodes,
  };
  if (data.offline) return { episodes };
  return {
    episodes,
    next: { version: 1, updatedAt: new Date(data.currentUpdatedAt ?? now).toISOString(), episode: data.current },
  };
}

/** A clock the test moves by hand. */
export interface TestClock {
  /** The time, epoch ms. */
  now(): number;
  /**
   * Move it forward.
   * @param ms How far.
   */
  advance(ms: number): void;
}

/**
 * A clock that starts at {@link T0} and stands still until the test advances it.
 * @returns The clock.
 */
export function clock(): TestClock {
  let time = T0;
  return { now: () => time, advance: (ms) => void (time += ms) };
}

/** Timers the test fires by hand, in the shape the store and the window both take. */
export type TestTimers = UmbraCoffeeStoreEnvironment & {
  /** Run every pending timer once. A timeout is gone once it has run; an interval stays. */
  fire(): void;
  /** How many timers are pending, of both kinds. */
  readonly count: number;
  /** The delay of every pending timeout, oldest first, so a case can assert the poll delay the store chose. */
  readonly timeoutDelays: number[];
};

/**
 * Timers that never fire by themselves, reading the time from a given clock. The store and the window
 * each get their own, on one clock, so a case can move the window's countdown without the store
 * polling, or the reverse. The store chains timeouts (its delay changes) and the window runs an
 * interval, so both kinds are here.
 * @param time The clock both read.
 * @returns The timers.
 */
export function timers(time: TestClock): TestTimers {
  const intervals = new Map<number, () => void>();
  const timeouts = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    setInterval: (fn) => (intervals.set(next, fn), next++),
    clearInterval: (id) => void intervals.delete(id),
    setTimeout: (fn, ms) => (timeouts.set(next, { fn, ms }), next++),
    clearTimeout: (id) => void timeouts.delete(id),
    now: () => time.now(),
    fire: () => {
      const due = [...timeouts.entries()];
      for (const [id] of due) timeouts.delete(id);
      [...intervals.values()].forEach((fn) => fn());
      due.forEach(([, { fn }]) => fn());
    },
    get count() {
      return intervals.size + timeouts.size;
    },
    get timeoutDelays() {
      return [...timeouts.values()].map((t) => t.ms);
    },
  };
}

/**
 * A store over fixed data, or over a fetcher a case controls, on the test's timers, so it never
 * reaches the network and never polls unless the case fires it.
 * @param source The data (served as the feed would serve it, see {@link feedOf}), or a fetcher.
 * @param env The timers and clock.
 * @returns The store.
 */
export function testStore(source: UmbraCoffeeData | UmbraCoffeeFetcher, env: TestTimers): UmbraCoffeeStore {
  return new UmbraCoffeeStore(typeof source === 'function' ? source : async () => feedOf(source, env.now()), env);
}

/** One notification the desktop stand-in was asked to raise, as it was asked. */
export interface RaisedNotification {
  /** Which call raised it: `peek` is timed, `stay` stays until closed. */
  method: 'peek' | 'stay';
  /** The severity it was raised with. */
  color: UmbNotificationColor;
  /** Everything else: `elementName`, `data`, `duration`. */
  options: UmbNotificationOptions<Record<string, unknown>>;
  /** Set once the raiser closed it through the handler it was given back. */
  closed?: boolean;
}

/**
 * Stands in for the desktop a tray item and a desktop toast's element sit in: a notification
 * context that records what is raised and the host's tray context, recording what is opened and
 * switched. Both are provided under the real tokens, so the elements consume them exactly as they
 * would inside the desktop. There is no auth context: nothing here reads the session any more
 * (design E10).
 *
 * Light DOM, so an element appended to it is a real, laid-out descendant rather than an unslotted
 * child, which also lets it serve as the sized box {@link sizedBox} makes.
 */
@customElement('umbracoffee-test-desktop-host')
export class TestDesktopHostElement extends UmbLitElement {
  /** Every notification raised through the stand-in, oldest first. */
  readonly raised: RaisedNotification[] = [];

  /** Every alias `openApp` was called with, oldest first. */
  readonly opened: string[] = [];

  /** Every `setTrayItemEnabled` call, oldest first. */
  readonly switched: Array<{ alias: string; enabled: boolean }> = [];

  /**
   * Called as each notification is raised, before it is recorded, so a case can look at the world
   * at that moment: whether the reminder record already holds the key, for one.
   */
  onRaise?: (raised: RaisedNotification) => void;

  /** Provides the two stand-ins, each cast because it implements only what the elements call. */
  constructor() {
    super();
    const raise = (method: RaisedNotification['method']) => (color: UmbNotificationColor, options: RaisedNotification['options']) => {
      const raised: RaisedNotification = { method, color, options };
      this.onRaise?.(raised);
      this.raised.push(raised);
      // The handler Umbraco returns, reduced to the one call the cup makes on it.
      return { close: () => void (raised.closed = true) };
    };
    this.provideContext(UMB_NOTIFICATION_CONTEXT, {
      peek: raise('peek'),
      stay: raise('stay'),
      getHostElement: () => this,
    } as unknown as UmbNotificationContext);
    const tray: UmbraDesktopTrayContextLike = {
      openApp: (alias) => (this.opened.push(alias), true),
      setTrayItemEnabled: (alias, enabled) => (this.switched.push({ alias, enabled }), true),
      getHostElement: () => this,
    };
    this.provideContext(UMBRADESKTOP_TRAY_CONTEXT, tray);
  }

  /**
   * No shadow root, so children render where they are.
   * @returns This element.
   */
  override createRenderRoot() {
    return this;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so `createElement` is typed. */
    'umbracoffee-test-desktop-host': TestDesktopHostElement;
  }
}

/**
 * What the settings stand-in's `formatDateTime` writes: nothing any culture would produce, so a case
 * can tell the desktop's formatting from the backoffice's at a glance, and carrying everything it
 * was given, so a case can tell it was given the right moment and the right options.
 *
 * It follows the desktop's own rule for the hour setting: the desktop applies the user's 12/24 hour cycle only
 * when the options set `hour`, so the stand-in writes its setting only then. A time asked for any
 * other way (with `timeStyle`, say) comes out without the setting, and a case comparing against this
 * with the setting in it fails, which is how the cases hold that every time asks for an hour.
 * @param date The moment.
 * @param options What was asked for.
 * @param setting What the stand-in's hour setting currently says.
 * @returns The text.
 */
export function desktopFormatted(date: Date, options: Intl.DateTimeFormatOptions, setting = 'h23'): string {
  const cycle = options.hour === undefined ? '' : ` ${setting}`;
  return `desktop${cycle} ${JSON.stringify(options)} ${date.toISOString()}`;
}

/**
 * Provide a stand-in for the desktop's settings context on a host, under the real alias, so an
 * element inside it consumes it exactly as it would inside the desktop. Call it before the element
 * goes in, as the desktop is there before its apps.
 * @param host The stand-in the element will sit in.
 * @param kind `current` for a desktop whose settings context publishes `formatDateTime`, `older` for
 *   one from before that method was public. Both publish `locale`, which the desktop's settings
 *   context had first.
 * @returns The hour setting the stand-in formats with; setting it emits on `locale`, as a user
 *   changing Clock would.
 */
export function provideDesktopSettings(
  host: UmbLitElement,
  kind: 'current' | 'older' = 'current',
): UmbStringState<string> {
  const setting = new UmbStringState('h23');
  const settings: UmbraDesktopSettingsContextLike = {
    locale: setting.asObservable(),
    getHostElement: () => host,
  };
  if (kind === 'current') settings.formatDateTime = (date, options) => desktopFormatted(date, options, setting.getValue());
  host.provideContext(UMBRADESKTOP_SETTINGS_CONTEXT, settings);
  return setting;
}

/**
 * A `localStorage` stand-in backed by a map, so each case starts empty and none touches the real one.
 * @returns The storage.
 */
export function memoryStorage(): ReminderStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

/** Every box handed out, so {@link removeBoxes} can take them all away after a case. */
const boxes: HTMLElement[] = [];

/**
 * A box of an exact size in the document, the way a window body hands an app one: `display: grid`
 * stretches what is put in it on both axes, as the window's flex body does.
 *
 * A box rather than `fixture`, for the reason Minesweeper's tests give: `fixture` on a plain `<div>`
 * waits for an animation frame the runner's backgrounded page never delivers.
 * @param size The box, in px.
 * @param box An element to use as the box, the auth stub for instance; a new `<div>` if none.
 * @returns The box, connected.
 */
export function sizedBox(size: { w: number; h: number }, box: HTMLElement = document.createElement('div')): HTMLElement {
  box.setAttribute('style', `display: grid; width: ${size.w}px; height: ${size.h}px`);
  if (!box.isConnected) document.body.appendChild(box);
  boxes.push(box);
  return box;
}

/** Remove every box {@link sizedBox} handed out. Call it from each test file's `afterEach`. */
export function removeBoxes(): void {
  for (const box of boxes.splice(0)) box.remove();
}
