import type { UmbraDesktopTheme } from '../types';
import { UMBRADESKTOP_UMBRACO_THEME } from './umbraco/index.js';

/** Id of the theme a user gets before they have chosen one, and whenever a stored id is unknown. */
export const UMBRADESKTOP_DEFAULT_THEME_ID = UMBRADESKTOP_UMBRACO_THEME.id;

/**
 * Every theme the package ships, in picker order. Curated rather than an extension point, the same
 * way the app catalogue is: adding a theme means adding a folder and one entry here.
 */
export const UMBRADESKTOP_THEMES: ReadonlyArray<UmbraDesktopTheme> = [UMBRADESKTOP_UMBRACO_THEME];

/**
 * Look up a theme by id.
 * @param id The stored theme id.
 * @returns The theme, or `undefined` when no theme has that id.
 */
export function findTheme(id: string): UmbraDesktopTheme | undefined {
  return UMBRADESKTOP_THEMES.find((theme) => theme.id === id);
}
