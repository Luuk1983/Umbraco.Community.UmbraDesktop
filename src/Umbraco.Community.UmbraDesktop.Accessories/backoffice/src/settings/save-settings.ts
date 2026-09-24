/**
 * Where Notepad and Paint save by default, and how that choice is stored.
 *
 * Pure functions over strings, with no storage and no DOM, for the reason the host's own
 * `settings-store.ts` gives: the fallback for every kind of unreadable payload is then a table a test
 * can walk, rather than something only a broken browser profile would ever exercise.
 */

/** Where Save sends a file: a download to this computer, or a media item in Umbraco. */
export type AccessoriesSaveDestination = 'computer' | 'media';

/** A media folder, remembered with its name so the settings screen can show it without a request. */
export interface AccessoriesMediaFolder {
  /** The folder's key. */
  unique: string;
  /** Its name when it was chosen. For display only; the key is what saving uses. */
  name: string;
}

/** The whole of the Accessories package's settings. */
export interface AccessoriesSaveSettings {
  /** Where Save and Ctrl+S send a file. The other destination is always one click away. */
  destination: AccessoriesSaveDestination;
  /** The media folder to save into, or null for the root of the media library. */
  folder: AccessoriesMediaFolder | null;
}

/**
 * What a user gets before choosing anything, and whenever the stored payload is unreadable.
 *
 * This computer, because it is the destination that always works: it needs no access to the Media
 * section, no media type that accepts `.txt`, and no server at all. Somebody who wants their notes in
 * the media library says so once, in Desktop settings.
 */
export const UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS: AccessoriesSaveSettings = Object.freeze({
  destination: 'computer',
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
 * Read stored settings, falling back field by field.
 *
 * A destination it does not recognise falls back to the whole default. A folder it cannot read falls
 * back to the root while keeping the destination, because "save to the media library" is the choice
 * the person made and the root is a safe place to honour it.
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
  const { destination, folder } = decoded as { destination?: unknown; folder?: unknown };
  if (destination !== 'computer' && destination !== 'media') return UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS;
  return { destination, folder: isFolder(folder) ? { unique: folder.unique, name: folder.name } : null };
}

/**
 * Write settings for storage.
 * @param settings The settings.
 * @returns The string to store.
 */
export function serializeSaveSettings(settings: AccessoriesSaveSettings): string {
  return JSON.stringify(settings);
}
