/**
 * Solitaire's settings, kept per browser in `localStorage` like Snake's best score (design D6):
 * a preference, not data, so losing it to a cleared cache costs nothing.
 *
 * Each field is stored as JSON so it survives reload and sign-out, and is repaired field-by-field
 * when the stored value is corrupt or missing, letting us evolve settings over time.
 */
import { CLASSIC_FACES_ALIAS, THEME_BACK_ALIAS } from './backs.js';
import type { DrawCount } from './rules.js';

/** Storage key. Final once shipped. */
export const SETTINGS_KEY = 'umbradesktop-entertainment-solitaire-settings';

/** What the player chose. */
export interface SolitaireSettings {
  readonly drawCount: DrawCount;
  /** Alias of a `umbraDesktopSolitaireBack`. */
  readonly back: string;
  /** Alias of a `umbraDesktopSolitaireFaces`. */
  readonly faces: string;
}

/** A fresh browser's settings. */
export const DEFAULT_SETTINGS: SolitaireSettings = {
  drawCount: 1,
  back: THEME_BACK_ALIAS,
  faces: CLASSIC_FACES_ALIAS,
};

/** Reaches the storage; may throw where site data is blocked, so it is called inside a `try`. */
export type StorageAccess = () => Storage;

/**
 * The stored settings, each field repaired to its default when missing or malformed. Repair is
 * field-by-field, so an entry with one bad field keeps the good ones and replaces only the bad.
 * @param storage How to reach storage.
 * @returns The settings.
 */
export function readSettings(storage: StorageAccess = () => window.localStorage): SolitaireSettings {
  try {
    const raw = JSON.parse(storage().getItem(SETTINGS_KEY) ?? '{}') as Partial<
      Record<keyof SolitaireSettings, unknown>
    >;
    return {
      drawCount: raw.drawCount === 3 ? 3 : DEFAULT_SETTINGS.drawCount,
      back: typeof raw.back === 'string' ? raw.back : DEFAULT_SETTINGS.back,
      faces: typeof raw.faces === 'string' ? raw.faces : DEFAULT_SETTINGS.faces,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Store the settings, silently doing nothing when storage refuses. A preference that does not
 * stick is not worth throwing: it still applies to this window, it just will not survive a reload.
 * @param settings What to store.
 * @param storage How to reach storage.
 */
export function writeSettings(
  settings: SolitaireSettings,
  storage: StorageAccess = () => window.localStorage,
): void {
  try {
    storage().setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // A preference that does not stick is not worth an error; it still applies to this window.
  }
}
