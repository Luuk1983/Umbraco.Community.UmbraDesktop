/**
 * The Accessories package's settings, and how they are stored: which media folder a new Notepad or
 * Paint file is saved into, and the screensaver.
 *
 * Pure functions over strings, with no storage and no DOM, for the reason the host's own
 * `settings-store.ts` gives: the fallback for every kind of unreadable payload is then a table a test
 * can walk, rather than something only a broken browser profile would ever exercise.
 *
 * A file opened from the media library is saved back where it lives; this folder only decides where
 * a new one goes.
 */

/** A media folder, remembered with its name so the settings screen can show it without a request. */
export interface AccessoriesMediaFolder {
  /** The folder's key. */
  unique: string;
  /** Its name when it was chosen. For display only; the key is what saving uses. */
  name: string;
}

/** The screensavers on offer, by id. The order is the order the Screen Saver window lists them in. */
export const UMBRADESKTOP_SCREENSAVERS = ['starfield', 'mystify', 'flying'] as const;

/** One screensaver's id. */
export type AccessoriesScreensaverId = (typeof UMBRADESKTOP_SCREENSAVERS)[number];

/**
 * The waits on offer, in minutes. A fixed list rather than any number, as Windows' own spinner was
 * in effect: nobody needs 7, and a list the settings screen and the parser both read cannot come to
 * disagree about what is allowed.
 */
export const UMBRADESKTOP_SCREENSAVER_WAIT_CHOICES = [1, 2, 5, 10, 15, 30] as const;

/** The screensaver's settings. */
export interface AccessoriesScreensaverSettings {
  /** Whether it starts on its own when the desktop is left alone. Preview works either way. */
  enabled: boolean;
  /** Which one. */
  saver: AccessoriesScreensaverId;
  /** How long the desktop must be left alone first, in minutes: one of {@link UMBRADESKTOP_SCREENSAVER_WAIT_CHOICES}. */
  waitMinutes: number;
}

/** The whole of the Accessories package's settings. */
export interface AccessoriesSettings {
  /** The folder new files are saved into, or null for the root of the media library. */
  folder: AccessoriesMediaFolder | null;
  /** The screensaver. */
  screensaver: AccessoriesScreensaverSettings;
}

/**
 * What a user gets before choosing anything, and whenever the stored payload is unreadable.
 *
 * The screensaver is off. Something that covers the whole backoffice without being asked would read
 * as a fault the first time it happened after an upgrade; turning it on is one click in the Screen
 * Saver window, which is where anybody curious about it will be looking.
 */
export const UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS: AccessoriesSettings = Object.freeze({
  folder: null,
  screensaver: Object.freeze({ enabled: false, saver: 'starfield', waitMinutes: 10 }),
});

/** Prefix of the per-user `localStorage` key. Namespaced apart from the host's own settings key. */
const STORAGE_KEY_PREFIX = 'umbradesktop-accessories:settings';

/**
 * The `localStorage` key holding one user's settings. Per user, as the host's are, so two accounts
 * sharing a browser do not share a media folder they may not both be able to reach.
 * @param userUnique The current user's key.
 * @returns The storage key.
 */
export function settingsStorageKey(userUnique: string): string {
  return `${STORAGE_KEY_PREFIX}:${userUnique}`;
}

/**
 * Whether a decoded value is a folder this version understands.
 * @param value The decoded `folder` property.
 * @returns True when usable.
 */
function isFolder(value: unknown): value is AccessoriesMediaFolder {
  if (typeof value !== 'object' || value === null) return false;
  const folder = value as Partial<AccessoriesMediaFolder>;
  return typeof folder.unique === 'string' && typeof folder.name === 'string';
}

/**
 * Read stored settings.
 *
 * A payload from the previous version also carries a `destination` (this computer or the media
 * library) from when saving could go either way. The folder still means what it meant and is kept;
 * the destination is dropped, since the media library is now the only place.
 * @param raw The stored string, or null when nothing is stored.
 * @returns Settings that are always usable.
 */
export function parseSettings(raw: string | null): AccessoriesSettings {
  if (!raw) return UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS;
  }
  if (typeof decoded !== 'object' || decoded === null) return UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS;
  const { folder, screensaver } = decoded as { folder?: unknown; screensaver?: unknown };
  return {
    folder: isFolder(folder) ? { unique: folder.unique, name: folder.name } : null,
    screensaver: parseScreensaver(screensaver),
  };
}

/**
 * Read the screensaver's settings field by field, so one bad value costs only itself.
 * @param value The decoded `screensaver` property.
 * @returns Usable screensaver settings.
 */
function parseScreensaver(value: unknown): AccessoriesScreensaverSettings {
  const fallback = UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS.screensaver;
  if (typeof value !== 'object' || value === null) return fallback;
  const { enabled, saver, waitMinutes } = value as Record<string, unknown>;
  return {
    enabled: typeof enabled === 'boolean' ? enabled : fallback.enabled,
    saver: (UMBRADESKTOP_SCREENSAVERS as readonly unknown[]).includes(saver)
      ? (saver as AccessoriesScreensaverId)
      : fallback.saver,
    waitMinutes: (UMBRADESKTOP_SCREENSAVER_WAIT_CHOICES as readonly unknown[]).includes(waitMinutes)
      ? (waitMinutes as number)
      : fallback.waitMinutes,
  };
}

/**
 * Write settings for storage.
 * @param settings The settings.
 * @returns The string to store.
 */
export function serializeSettings(settings: AccessoriesSettings): string {
  return JSON.stringify(settings);
}
