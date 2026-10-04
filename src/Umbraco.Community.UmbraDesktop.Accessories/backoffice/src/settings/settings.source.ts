import { UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS, parseSettingsValue } from './settings.js';
import type { AccessoriesSettings } from './settings.js';
import { ACCESSORIES_USER_DATA_GROUP } from '../shared/user-data.js';
import { UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT } from '../shared/package-settings.js';
import type { UmbraDesktopPackageSettingsStore } from '../shared/package-settings.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

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
 * An interface rather than the controller below, so that the screensaver's settings box and the idle
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

/**
 * Accessories' settings, kept in the desktop's per-user store under this package's own user-data
 * group: the same row they were in before the store moved into the desktop, so nothing was migrated
 * (design 2026-10-03 §8). Turns the store's untyped value into `AccessoriesSettings` on every read,
 * so a malformed or older value can never reach the screensaver.
 *
 * Plain, with the store handed to {@link use}, so it can be tested without a backoffice; the
 * controller below finds the store.
 */
export class AccessoriesHostSettings implements AccessoriesSettingsSource {
  /** The desktop's store, once found. */
  #store?: UmbraDesktopPackageSettingsStore;

  /** Stops listening to it. */
  #unsubscribe?: () => void;

  /** Who is told about a change. */
  #listeners = new Set<(value: AccessoriesSettings) => void>();

  /**
   * The last value read, and the raw value it was read from, so a read parses once per change. The
   * store keeps its parsed value until the stored string changes, so identity is the right test.
   */
  #cache?: { raw: unknown; value: AccessoriesSettings };

  /**
   * Start reading from a store, or stop with undefined. Tells the listeners either way, since the
   * value on show may have changed with the store.
   * @param store The desktop's store for this package.
   */
  use(store: UmbraDesktopPackageSettingsStore | undefined): void {
    this.#unsubscribe?.();
    this.#store = store;
    this.#unsubscribe = store?.subscribe(() => this.#notify());
    this.#notify();
  }

  /** @inheritdoc */
  get value(): AccessoriesSettings {
    const raw = this.#store?.value;
    if (!this.#cache || this.#cache.raw !== raw) this.#cache = { raw, value: parseSettingsValue(raw) };
    return this.#cache.value;
  }

  /** @inheritdoc */
  get status(): AccessoriesSettingsStatus | undefined {
    return this.#store?.status;
  }

  /**
   * Change the settings. Dropped while there is no store, which is only before the desktop's
   * context has been found: nothing can have been shown to change by then.
   * @param next The new settings.
   */
  set(next: AccessoriesSettings): void {
    this.#store?.set(next);
  }

  /** @inheritdoc */
  subscribe(listener: (value: AccessoriesSettings) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stop listening to the store. It belongs to the desktop and lives as long as the page. */
  close(): void {
    this.use(undefined);
  }

  /** Tell every listener the settings as they stand. */
  #notify(): void {
    const value = this.value;
    for (const listener of this.#listeners) listener(value);
  }
}

/**
 * The settings of the signed-in user, for an element or an entry point: finds the desktop's package
 * settings context and reads through {@link AccessoriesHostSettings}. The context is global, so an
 * entry point outside the desktop reaches it as well as a window or a settings box does.
 *
 * Reading the account is the desktop's work: it reads a store once a user is signed in, and every
 * element in the page shares that one store, so a change reaches them all without an event of its own.
 */
export class UmbraDesktopAccessoriesSettingsController
  extends UmbControllerBase
  implements AccessoriesSettingsSource
{
  /** The adapter that does the work. */
  #settings = new AccessoriesHostSettings();

  /**
   * @param host The element or entry point host whose lifetime this follows.
   */
  constructor(host: UmbControllerHost) {
    super(host);
    this.consumeContext(UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT, (context) => {
      this.#settings.use(context?.store(ACCESSORIES_USER_DATA_GROUP));
    });
  }

  /** @inheritdoc */
  get value(): AccessoriesSettings {
    return this.#settings.value;
  }

  /** @inheritdoc */
  get status(): AccessoriesSettingsStatus | undefined {
    return this.#settings.status;
  }

  /** @inheritdoc */
  set(next: AccessoriesSettings): void {
    this.#settings.set(next);
  }

  /** @inheritdoc */
  subscribe(listener: (value: AccessoriesSettings) => void): () => void {
    return this.#settings.subscribe(listener);
  }

  /** Stop listening to the store with the host. */
  override destroy(): void {
    this.#settings.close();
    super.destroy();
  }
}
