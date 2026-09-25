/**
 * The Accessories package's settings, and how they are stored. One today, the screensaver, set in
 * the Screen Saver window; the record is kept as a record so a later setting has somewhere to go.
 *
 * Pure functions over strings, with no storage and no DOM, for the reason the host's own
 * `settings-store.ts` gives: the fallback for every kind of unreadable payload is then a table a test
 * can walk, rather than something only a broken browser profile would ever exercise.
 */

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
  screensaver: Object.freeze({ enabled: false, saver: 'starfield', waitMinutes: 10 }),
});

/** Prefix of the per-user `localStorage` key. Namespaced apart from the host's own settings key. */
const STORAGE_KEY_PREFIX = 'umbradesktop-accessories:settings';

/**
 * The `localStorage` key holding one user's settings. Per user, as the host's are, so two accounts
 * sharing a browser do not share one person's choices.
 * @param userUnique The current user's key.
 * @returns The storage key.
 */
export function settingsStorageKey(userUnique: string): string {
  return `${STORAGE_KEY_PREFIX}:${userUnique}`;
}

/**
 * Read stored settings.
 *
 * Payloads from earlier versions also carry a `folder`, from when new Notepad and Paint files went
 * into a folder set in Desktop settings, and before that a `destination`. Both are ignored: a new
 * file's folder is now asked for on its first save.
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
  const { screensaver } = decoded as { screensaver?: unknown };
  return {
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
