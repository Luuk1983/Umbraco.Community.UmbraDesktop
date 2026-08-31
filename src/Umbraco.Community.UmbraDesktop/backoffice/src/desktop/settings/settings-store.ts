import type { UmbraDesktopSettings, UmbraDesktopWallpaperRef } from './types';
import { UMBRADESKTOP_DEFAULT_WALLPAPER_ID } from './wallpapers.generated';

/**
 * Reading and writing desktop settings, as pure functions over strings — no DOM, no storage.
 * The context owns the actual `localStorage` access; keeping the parsing here is what makes the
 * fallback matrix below directly testable.
 */

/** Prefix of the per-user `localStorage` key. */
const STORAGE_KEY_PREFIX = 'umbradesktop:settings';

/** What a user gets before they have chosen anything, and whenever their stored payload is unreadable. */
export const UMBRADESKTOP_DEFAULT_SETTINGS: UmbraDesktopSettings = {
  v: 1,
  wallpaper: { kind: 'builtin', id: UMBRADESKTOP_DEFAULT_WALLPAPER_ID },
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
 * Decode a stored payload into settings. Never throws and never returns something partially
 * valid: anything unreadable — absent, malformed, a version this build predates, a wallpaper
 * shape it does not recognise — yields a fresh copy of the defaults. A silently reset preference
 * is a far better failure than a blank desktop.
 * @param raw The raw string from storage, or `null` when nothing is stored.
 * @returns Valid settings, always safe to mutate.
 */
export function parseSettings(raw: string | null): UmbraDesktopSettings {
  const fallback = (): UmbraDesktopSettings => ({
    v: 1,
    wallpaper: { ...UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper },
  });

  if (!raw) return fallback();

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return fallback();
  }

  if (typeof decoded !== 'object' || decoded === null) return fallback();

  const payload = decoded as { v?: unknown; wallpaper?: unknown };
  if (payload.v !== 1 || !isWallpaperRef(payload.wallpaper)) return fallback();

  return { v: 1, wallpaper: payload.wallpaper };
}

/**
 * Encode settings for storage.
 * @param settings The settings to persist.
 * @returns The JSON payload.
 */
export function serialiseSettings(settings: UmbraDesktopSettings): string {
  return JSON.stringify(settings);
}
