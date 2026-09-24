/**
 * Which media folder a new Notepad or Paint file is saved into, and how that choice is stored.
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

/** The whole of the Accessories package's settings. */
export interface AccessoriesSaveSettings {
  /** The folder new files are saved into, or null for the root of the media library. */
  folder: AccessoriesMediaFolder | null;
}

/** What a user gets before choosing anything, and whenever the stored payload is unreadable. */
export const UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS: AccessoriesSaveSettings = Object.freeze({
  folder: null,
});

/** Prefix of the per-user `localStorage` key. Namespaced apart from the host's own settings key. */
const STORAGE_KEY_PREFIX = 'umbradesktop-accessories:settings';

/**
 * The `localStorage` key holding one user's settings. Per user, as the host's are, so two accounts
 * sharing a browser do not share a media folder they may not both be able to reach.
 * @param userUnique The current user's key.
 * @returns The storage key.
 */
export function saveSettingsStorageKey(userUnique: string): string {
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
export function parseSaveSettings(raw: string | null): AccessoriesSaveSettings {
  if (!raw) return UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS;
  }
  if (typeof decoded !== 'object' || decoded === null) return UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS;
  const { folder } = decoded as { folder?: unknown };
  return isFolder(folder) ? { folder: { unique: folder.unique, name: folder.name } } : UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS;
}

/**
 * Write settings for storage.
 * @param settings The settings.
 * @returns The string to store.
 */
export function serializeSaveSettings(settings: AccessoriesSaveSettings): string {
  return JSON.stringify(settings);
}
