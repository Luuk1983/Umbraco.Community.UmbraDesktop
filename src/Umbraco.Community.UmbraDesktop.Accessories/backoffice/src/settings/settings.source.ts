import {
  UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS,
  parseSettings,
  settingsStorageKey,
  serializeSettings,
} from './settings.js';
import type { AccessoriesSettings } from './settings.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';

/**
 * Where an element reads the save settings from and writes them to.
 *
 * An interface rather than the controller below, so that Notepad, Paint and the settings screen can
 * each be handed a {@link fixedSettings} in a test: the real one needs the current user, which
 * only a booted backoffice has.
 */
export interface AccessoriesSettingsSource {
  /** The settings now. The default until the stored ones have been read. */
  readonly value: AccessoriesSettings;
  /**
   * Change the settings, everywhere at once.
   * @param next The new settings.
   */
  set(next: AccessoriesSettings): void;
  /**
   * Be told when the settings change, including by another window or tab.
   * @param listener Called with the new settings.
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
 * The event a write announces itself with, on `window`.
 *
 * `storage` events only reach *other* documents, so a Notepad window and the settings panel in the
 * same backoffice would not hear each other through it. Every controller writes through this event
 * as well, and listens to both.
 */
const CHANGED = 'umbradesktop-accessories:settings-changed';

/**
 * The save settings as stored for the current user in this browser, kept current.
 *
 * One per element that needs them rather than one shared instance: each is a controller on its own
 * host, so it lives and dies with the window or the panel, and the event above is what keeps them in
 * step. Stored per user and per browser, the same scope as the host's own desktop settings, and for
 * the same reason: a desktop is somebody's, on some machine.
 */
export class UmbraDesktopAccessoriesSettingsController
  extends UmbControllerBase
  implements AccessoriesSettingsSource
{
  #value: AccessoriesSettings = UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS;

  /** The storage key, once the current user is known. */
  #key?: string;

  #listeners = new Set<(value: AccessoriesSettings) => void>();

  /** @param host The element whose lifetime this controller shares. */
  constructor(host: UmbControllerHost) {
    super(host);
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
      this.observe(
        context?.unique,
        (unique) => {
          this.#key = unique ? settingsStorageKey(unique) : undefined;
          this.#load();
        },
        'observeCurrentUserUnique',
      );
    });
  }

  /** @inheritdoc */
  get value(): AccessoriesSettings {
    return this.#value;
  }

  /** Listen for changes made elsewhere. */
  override hostConnected(): void {
    super.hostConnected();
    window.addEventListener(CHANGED, this.#onChanged);
    window.addEventListener('storage', this.#onChanged);
  }

  /** Stop listening. */
  override hostDisconnected(): void {
    window.removeEventListener(CHANGED, this.#onChanged);
    window.removeEventListener('storage', this.#onChanged);
    super.hostDisconnected();
  }

  /** @inheritdoc */
  set(next: AccessoriesSettings): void {
    if (this.#key) {
      try {
        localStorage.setItem(this.#key, serializeSettings(next));
      } catch {
        // Storage refused (private mode, quota). The choice still holds for this session.
      }
    }
    this.#apply(next);
    window.dispatchEvent(new CustomEvent(CHANGED));
  }

  /** @inheritdoc */
  subscribe(listener: (value: AccessoriesSettings) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Another controller, or another tab, changed the settings: read them again. */
  #onChanged = (): void => this.#load();

  /** Read the stored settings for the current user. */
  #load(): void {
    let raw: string | null = null;
    try {
      raw = this.#key ? localStorage.getItem(this.#key) : null;
    } catch {
      // Storage unreadable: the default stands.
    }
    this.#apply(parseSettings(raw));
  }

  /**
   * Take new settings and tell the listeners, if anything changed.
   * @param next The settings.
   */
  #apply(next: AccessoriesSettings): void {
    if (serializeSettings(next) === serializeSettings(this.#value)) return;
    this.#value = next;
    for (const listener of this.#listeners) listener(next);
  }
}
