import type { UmbraDesktopSettings, UmbraDesktopWallpaperRef } from './types';
import { UMBRADESKTOP_DEFAULT_WALLPAPER_ID } from './wallpapers.generated';
import { UMBRADESKTOP_DEFAULT_THEME_ID } from '../theme/themes/index';

/**
 * Reading and writing desktop settings, as pure functions over strings — no DOM, no storage.
 * The context owns the actual `localStorage` access; keeping the parsing here is what makes the
 * fallback matrix below directly testable.
 */

/** Prefix of the per-user `localStorage` key. */
const STORAGE_KEY_PREFIX = 'umbradesktop:settings';

/**
 * Favourites for a user who has never pinned anything. The seed applies only when nothing is
 * stored: a user who deliberately unpins everything keeps an empty list.
 */
export const UMBRADESKTOP_DEFAULT_PINNED: ReadonlyArray<string> = ['content', 'media', 'log-viewer'];

/** What a user gets before they have chosen anything, and whenever their stored payload is unreadable. */
export const UMBRADESKTOP_DEFAULT_SETTINGS: UmbraDesktopSettings = {
  v: 1,
  wallpaper: { kind: 'builtin', id: UMBRADESKTOP_DEFAULT_WALLPAPER_ID },
  theme: UMBRADESKTOP_DEFAULT_THEME_ID,
  pinned: [...UMBRADESKTOP_DEFAULT_PINNED],
};

/**
 * The `localStorage` key holding one user's settings. Scoped by user so two accounts sharing a
 * machine — or a browser where someone logs out and back in as somebody else — do not inherit
 * each other's desktop.
 * @param userUnique The current user's unique id.
 * @returns The storage key.
 */
export function settingsStorageKey(userUnique: string): string {
  return `${STORAGE_KEY_PREFIX}:${userUnique}`;
}

/**
 * Whether a decoded value is a wallpaper reference this version understands. A ref that names a
 * built-in image that no longer exists still passes here — that is resolved against the
 * catalogue when the wallpaper is painted, not when it is read.
 * @param value The decoded `wallpaper` property.
 * @returns True when the value is a usable reference.
 */
function isWallpaperRef(value: unknown): value is UmbraDesktopWallpaperRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Partial<UmbraDesktopWallpaperRef> & { kind?: unknown };
  switch (ref.kind) {
    case 'none':
      return true;
    case 'builtin':
      return typeof (ref as { id?: unknown }).id === 'string';
    case 'media':
      return typeof (ref as { unique?: unknown }).unique === 'string';
    default:
      return false;
  }
}

/**
 * Whether a decoded value is a list of pinned app aliases.
 * @param value The decoded `pinned` property.
 * @returns True when the value is a usable list.
 */
function isPinnedList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Whether a decoded value is a theme id this version can store. An id naming a theme that no
 * longer exists still passes here — that is resolved against the catalogue when the theme is
 * applied, not when it is read, exactly as with wallpaper references.
 * @param value The decoded `theme` property.
 * @returns True when the value is a usable id.
 */
function isThemeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Decode a stored payload into settings. Never throws, and never returns something partially
 * valid: anything unreadable — absent, malformed, or a version this build predates — yields a
 * fresh copy of the defaults. A silently reset preference is a far better failure than a blank
 * desktop.
 *
 * Within a payload this build *does* understand, each field recovers **independently**: a
 * wallpaper reference it cannot read does not cost the user their Favourites, and vice versa.
 * @param raw The raw string from storage, or `null` when nothing is stored.
 * @returns Valid settings, always safe to mutate.
 */
export function parseSettings(raw: string | null): UmbraDesktopSettings {
  const fallback = (): UmbraDesktopSettings => ({
    v: 1,
    wallpaper: { ...UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper },
    theme: UMBRADESKTOP_DEFAULT_SETTINGS.theme,
    pinned: [...UMBRADESKTOP_DEFAULT_PINNED],
  });

  if (!raw) return fallback();

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return fallback();
  }

  if (typeof decoded !== 'object' || decoded === null) return fallback();

  const payload = decoded as { v?: unknown; wallpaper?: unknown; pinned?: unknown; theme?: unknown };
  if (payload.v !== 1) return fallback();

  const settings = fallback();
  if (isWallpaperRef(payload.wallpaper)) settings.wallpaper = payload.wallpaper;
  if (isThemeId(payload.theme)) settings.theme = payload.theme;
  if (isPinnedList(payload.pinned)) settings.pinned = payload.pinned;
  return settings;
}

/**
 * Encode settings for storage.
 * @param settings The settings to persist.
 * @returns The JSON payload.
 */
export function serialiseSettings(settings: UmbraDesktopSettings): string {
  return JSON.stringify(settings);
}
