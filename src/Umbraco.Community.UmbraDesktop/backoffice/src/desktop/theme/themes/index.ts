import type { UmbraDesktopTheme } from '../types';
import { UMBRADESKTOP_UMBRACO_THEME } from './umbraco/index.js';
import { UMBRADESKTOP_MACOS_THEME } from './macos/index.js';

/** Id of the theme a user gets before they have chosen one, and whenever a stored id is unknown. */
export const UMBRADESKTOP_DEFAULT_THEME_ID = UMBRADESKTOP_UMBRACO_THEME.id;

/**
 * Every theme the package ships, in picker order. Curated rather than an extension point, the same
 * way the app catalogue is: adding a theme means adding a folder and one entry here.
 *
 * Deliberately no `findTheme`/lookup helper here: the theme resolver owns that job, against a
 * catalogue passed in as a parameter rather than this module's global, so its tests can pass a
 * fixture catalogue instead of reaching for the real one. A second lookup hardwired to
 * `UMBRADESKTOP_THEMES` would just be a trap for whoever reaches for it instead of the resolver.
 */
export const UMBRADESKTOP_THEMES: ReadonlyArray<UmbraDesktopTheme> = [
  UMBRADESKTOP_UMBRACO_THEME,
  UMBRADESKTOP_MACOS_THEME,
];
