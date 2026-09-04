import type { UmbraDesktopPalette, UmbraDesktopTheme } from './types';
import { UMBRADESKTOP_THEMES } from './themes/index.js';
import { UMBRADESKTOP_UMBRACO_THEME } from './themes/umbraco/index.js';
import { UMB_THEME_DARK_ALIAS, UMB_THEME_HIGH_CONTRAST_ALIAS } from '@umbraco-cms/backoffice/themes';

/** Which of a theme's palettes is in use. */
export type UmbraDesktopVariant = 'light' | 'dark';

/** A resolved theme: what to paint, and why. */
export interface UmbraDesktopResolvedTheme {
  /** The theme actually in force — not necessarily the one the user chose. */
  theme: UmbraDesktopTheme;
  /** Which variant of it. */
  variant: UmbraDesktopVariant;
  /** The palette to apply. */
  palette: UmbraDesktopPalette;
  /** True when the user's choice was overridden because the backoffice is in high contrast. */
  forcedByContrast: boolean;
}

/**
 * Decide which theme and variant to paint, from the user's stored choice and the backoffice's own
 * theme.
 *
 * Two overrides are deliberate. **High contrast wins over any choice**: that stylesheet works by
 * redefining `--uui-*` tokens, which only the Umbraco identity theme reads, so honouring a macOS
 * palette there would quietly undo an accessibility setting. And an **unknown id** — a theme
 * dropped in an upgrade — falls back rather than leaving the desktop unstyled.
 * @param themeId The user's stored theme id.
 * @param umbThemeAlias The alias from Umbraco's own theme context.
 * @param catalogue The themes to choose from; defaults to everything the package ships.
 * @returns The theme, variant and palette to apply.
 */
export function resolveTheme(
  themeId: string,
  umbThemeAlias: string,
  catalogue: ReadonlyArray<UmbraDesktopTheme> = UMBRADESKTOP_THEMES,
): UmbraDesktopResolvedTheme {
  if (umbThemeAlias === UMB_THEME_HIGH_CONTRAST_ALIAS) {
    return {
      theme: UMBRADESKTOP_UMBRACO_THEME,
      variant: 'light',
      palette: UMBRADESKTOP_UMBRACO_THEME.palettes.light,
      forcedByContrast: true,
    };
  }

  const theme = catalogue.find((entry) => entry.id === themeId) ?? UMBRADESKTOP_UMBRACO_THEME;
  const wantsDark = umbThemeAlias === UMB_THEME_DARK_ALIAS;
  const dark = theme.palettes.dark;

  return wantsDark && dark
    ? { theme, variant: 'dark', palette: dark, forcedByContrast: false }
    : { theme, variant: 'light', palette: theme.palettes.light, forcedByContrast: false };
}
