import { UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS, parseSettings, serializeSettings } from './settings.js';
import type { AccessoriesSettings } from './settings.js';
import { ACCESSORIES_USER_DATA_GROUP, UserDataDocument, createUserDataClient } from '../shared/user-data.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';

/**
 * Why the settings on show may not be the ones in the user's account.
 * - `unread`: the account could not be asked, so what shows is the default.
 * - `unsaved`: the last change could not be stored. It holds in this page, and is saved with the
 *   next change.
 */
export type AccessoriesSettingsStatus = 'unread' | 'unsaved';

/**
 * Where an element reads the package's settings from and writes them to.
 *
 * An interface rather than the controller below, so that the Screen Saver window and the idle
 * watcher can each be handed a {@link fixedSettings} in a test: the real one needs a signed-in user,
 * which only a booted backoffice has.
 */
export interface AccessoriesSettingsSource {
  /** The settings now. The default until the stored ones have been read. */
  readonly value: AccessoriesSettings;
  /**
   * Why the value may differ from what is stored, when it may. Undefined when all is well, and
   * always for a source that stores nothing, which has nothing to fail at.
   */
  readonly status?: AccessoriesSettingsStatus;
  /**
   * Change the settings, everywhere at once.
   * @param next The new settings.
   */
  set(next: AccessoriesSettings): void;
  /**
   * Be told when the settings change, including by another window or tab, and when the status does.
   * @param listener Called with the settings.
   * @returns A function that stops the calls.
   */
  subscribe(listener: (value: AccessoriesSettings) => void): () => void;
}

/**
 * Settings held in memory, for a test or anywhere there is no user to store them for.
 * @param initial The starting settings. Anything left out takes its default, so a test says only
 *   what it is about.
 * @returns A source that keeps them until it is changed.
 */
export function fixedSettings(initial: Partial<AccessoriesSettings> = {}): AccessoriesSettingsSource {
  let value: AccessoriesSettings = { ...UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS, ...initial };
  const listeners = new Set<(value: AccessoriesSettings) => void>();
  return {
    get value() {
      return value;
    },
    set(next) {
      value = next;
      for (const listener of listeners) listener(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The `umbracoUserData` identifier the settings document is stored under, within the package's group. Final, like the group. */
const SETTINGS_IDENTIFIER = 'Settings';

/**
 * The `BroadcastChannel` a saved change is announced on, so other tabs of the same browser follow
 * it at once, as they did through `storage` events when the settings lived in `localStorage`. Named
 * after the package and what it carries, so nothing else on the origin talks on it by accident.
 * Tabs in other browsers pick the change up the next time they load.
 */
export const ACCESSORIES_SETTINGS_CHANNEL = `${ACCESSORIES_USER_DATA_GROUP}.Settings`;

/** The part of {@link UserDataDocument} the store uses, so a test can hand it a stand-in. */
export type AccessoriesSettingsDocument = Pick<UserDataDocument, 'read' | 'write'>;

/**
 * The settings of the signed-in user, kept in their account and held in the page.
 *
 * One per page (see {@link sharedSettingsStore}), so every element in it reads one value and one
 * write reaches them all at once. The rules:
 * - the value is the default until the stored one has loaded, and the default has the screensaver
 *   off, so nothing starts on the strength of a setting nobody has read yet;
 * - a change applies in the page at once and is stored in the background, one write at a time,
 *   ending on the latest;
 * - a failed write keeps the change in the page and says so through {@link status}, rather than
 *   losing it quietly; the next change stores the whole value again;
 * - stored settings that arrive after a change was made are older than it, and are not applied;
 * - a stored change is announced to other tabs on {@link ACCESSORIES_SETTINGS_CHANNEL}.
 */
export class AccessoriesSettingsStore implements AccessoriesSettingsSource {
  /** The settings on show. */
  #value: AccessoriesSettings = UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS;

  /** See {@link status}. */
  #status?: AccessoriesSettingsStatus;

  /** Who is told about a change. */
  #listeners = new Set<(value: AccessoriesSettings) => void>();

  /** Whether the stored settings have been read. Reading again after that would only undo changes. */
  #loaded = false;

  /** The read in progress, so a second {@link load} joins it rather than asking twice. */
  #loading?: Promise<void>;

  /**
   * Bumped by every change made here or heard from another tab. A read compares it before and
   * after, so a value that was stored before the change does not overwrite it.
   */
  #changes = 0;

  /** The newest change not yet written, if any. Only the newest is written: it is the whole value. */
  #pending?: AccessoriesSettings;

  /** The write loop in progress, if any. */
  #writing?: Promise<void>;

  /** The channel to other tabs, where the browser has one. */
  #channel?: BroadcastChannel;

  /**
   * @param document Where the settings are stored.
   * @param channelName The cross-tab channel's name. Omit for no channel; tests pass their own so
   *   two cases never hear each other.
   */
  constructor(
    private readonly document: AccessoriesSettingsDocument,
    channelName?: string,
  ) {
    if (channelName && typeof BroadcastChannel !== 'undefined') {
      this.#channel = new BroadcastChannel(channelName);
      this.#channel.onmessage = (event: MessageEvent) => this.#onBroadcast(event.data);
    }
  }

  /** @inheritdoc */
  get value(): AccessoriesSettings {
    return this.#value;
  }

  /** @inheritdoc */
  get status(): AccessoriesSettingsStatus | undefined {
    return this.#status;
  }

  /**
   * Read the stored settings, once. Safe to call from every element that needs them: a second call
   * joins the read in progress, and one after a successful read does nothing. One after a failed
   * read tries again, so opening the Screen Saver window is also a retry.
   * @returns When the read has answered.
   */
  load(): Promise<void> {
    if (this.#loaded) return Promise.resolve();
    this.#loading ??= this.#read().finally(() => (this.#loading = undefined));
    return this.#loading;
  }

  /** @inheritdoc */
  set(next: AccessoriesSettings): void {
    this.#changes++;
    this.#apply(next);
    this.#pending = next;
    this.#writing ??= this.#flush().finally(() => (this.#writing = undefined));
  }

  /** @inheritdoc */
  subscribe(listener: (value: AccessoriesSettings) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * When every change made so far has been written, or has failed to be.
   * @returns A promise that settles then.
   */
  async saved(): Promise<void> {
    while (this.#writing) await this.#writing;
  }

  /** Stop hearing other tabs. For tests and for the package unloading; the page's store is otherwise never closed. */
  close(): void {
    this.#channel?.close();
    this.#channel = undefined;
  }

  /** Read the stored settings, and take them unless something newer arrived meanwhile. */
  async #read(): Promise<void> {
    const changesAtStart = this.#changes;
    const raw = await this.document.read();
    if (raw === undefined) {
      this.#setStatus('unread');
      return;
    }
    this.#loaded = true;
    if (this.#status === 'unread') this.#setStatus(undefined);
    if (this.#changes !== changesAtStart) return;
    this.#apply(parseSettings(raw));
  }

  /** Write the newest change until none is left, then say how the last write went. */
  async #flush(): Promise<void> {
    while (this.#pending) {
      const next = this.#pending;
      this.#pending = undefined;
      const serialized = serializeSettings(next);
      const stored = await this.document.write(serialized);
      // A newer change is already waiting; its write decides the status.
      if (this.#pending) continue;
      if (stored) this.#channel?.postMessage(serialized);
      this.#setStatus(stored ? undefined : 'unsaved');
    }
  }

  /**
   * Another tab stored a change: follow it. It was stored, so a failure of this tab's own is
   * superseded by it, and it is newer than any read still in progress.
   * @param data The message, the stored string.
   */
  #onBroadcast(data: unknown): void {
    if (typeof data !== 'string') return;
    this.#changes++;
    this.#pending = undefined;
    if (this.#status === 'unsaved') this.#status = undefined;
    this.#apply(parseSettings(data), true);
  }

  /**
   * Change the status, and tell the listeners so a window can show it.
   * @param status The new status.
   */
  #setStatus(status: AccessoriesSettingsStatus | undefined): void {
    if (status === this.#status) return;
    this.#status = status;
    this.#notify();
  }

  /**
   * Take new settings and tell the listeners, if anything changed.
   * @param next The settings.
   * @param always Tell the listeners even when the value is the same, because something else
   *   about the store changed with it.
   */
  #apply(next: AccessoriesSettings, always = false): void {
    if (!always && serializeSettings(next) === serializeSettings(this.#value)) return;
    this.#value = next;
    this.#notify();
  }

  /** Tell every listener the settings as they stand. */
  #notify(): void {
    for (const listener of this.#listeners) listener(this.#value);
  }
}

/** The page's one store, made on first use. */
let shared: AccessoriesSettingsStore | undefined;

/**
 * The page's settings store, made the first time anything asks.
 *
 * In the backoffice the first to ask is the screensaver's entry point, whose host is the
 * backoffice's root and lives as long as the page, which matters because the store makes its
 * requests on that host. The requests are quiet: a failure is shown in the Screen Saver window
 * through {@link AccessoriesSettingsStore.status}, where the person who made the change is looking.
 * @param host The element to make requests for, if the store does not exist yet.
 * @returns The store.
 */
export function sharedSettingsStore(host: UmbControllerHost): AccessoriesSettingsStore {
  shared ??= new AccessoriesSettingsStore(
    new UserDataDocument(createUserDataClient(host), ACCESSORIES_USER_DATA_GROUP, SETTINGS_IDENTIFIER),
    ACCESSORIES_SETTINGS_CHANNEL,
  );
  return shared;
}

/** Close and forget the page's store, when the package unloads, so a reload starts clean. */
export function releaseSharedSettingsStore(): void {
  shared?.close();
  shared = undefined;
}

/**
 * The page's settings, for one element: the Screen Saver window, or the idle watcher.
 *
 * A controller so it can wait for a signed-in user before asking the account, which the
 * `user-data` endpoints read the user from, and so the store's first read is started by whichever
 * element needs it first. Everything else is the page's one {@link AccessoriesSettingsStore}, so
 * every element sees one value and a change reaches them all without an event of its own.
 */
export class UmbraDesktopAccessoriesSettingsController
  extends UmbControllerBase
  implements AccessoriesSettingsSource
{
  /** The page's store. */
  #store: AccessoriesSettingsStore;

  /**
   * @param host The element whose lifetime this controller shares.
   * @param store The store to use. The page's one unless a test says otherwise.
   */
  constructor(host: UmbControllerHost, store: AccessoriesSettingsStore = sharedSettingsStore(host)) {
    super(host);
    this.#store = store;
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
      this.observe(
        context?.unique,
        (unique) => {
          if (unique) void this.#store.load();
        },
        'observeCurrentUserUnique',
      );
    });
  }

  /** @inheritdoc */
  get value(): AccessoriesSettings {
    return this.#store.value;
  }

  /** @inheritdoc */
  get status(): AccessoriesSettingsStatus | undefined {
    return this.#store.status;
  }

  /** @inheritdoc */
  set(next: AccessoriesSettings): void {
    this.#store.set(next);
  }

  /** @inheritdoc */
  subscribe(listener: (value: AccessoriesSettings) => void): () => void {
    return this.#store.subscribe(listener);
  }
}
