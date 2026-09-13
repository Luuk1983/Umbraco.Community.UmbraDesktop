import type { UmbraDesktopPalette, UmbraDesktopTheme } from './types';
import { UMBRADESKTOP_UMBRACO_THEME } from './themes/umbraco/index.js';
import { UMB_THEME_DARK_ALIAS, UMB_THEME_HIGH_CONTRAST_ALIAS } from '@umbraco-cms/backoffice/themes';

/** Which of a theme's palettes is in use. */
export type UmbraDesktopVariant = 'light' | 'dark';

/**
 * What to resolve. An object rather than positional arguments because `themeId` and
 * `umbThemeAlias` are both opaque strings: transposed, they would not fail, they would quietly
 * resolve to the identity theme and look plausible. `resolveWallpaper` takes a structured ref for
 * the same reason.
 */
export interface UmbraDesktopThemeRequest {
  /** The user's stored theme id. */
  themeId: string;
  /** The alias from Umbraco's own theme context. */
  umbThemeAlias: string;
  /** The themes to choose from. Passed in, not defaulted, so the dependency is visible at the call site. */
  catalogue: ReadonlyArray<UmbraDesktopTheme>;
}

/** A resolved theme: what to paint, and why. */
export interface UmbraDesktopResolvedTheme {
  /** The theme actually in force — not necessarily the one the user chose. */
  theme: UmbraDesktopTheme;
  /** Which variant of it. */
  variant: UmbraDesktopVariant;
  /** The palette to apply. */
  palette: UmbraDesktopPalette;
  /**
   * True when the backoffice is in high contrast. The chosen theme is still honoured — this says
   * the *variant* was decided by the accessibility setting rather than by light/dark, which is
   * worth telling the user because the chrome is not itself high contrast.
   */
  highContrast: boolean;
}

/**
 * Which variant the **backoffice itself** is in, from its theme alias alone.
 *
 * Deliberately separate from {@link resolveTheme}'s `variant`, because the two answer different
 * questions and confusing them is a bug that has already shipped once. `resolved.variant` says
 * *which palette is being painted*, which for a theme that never wrote a dark one is `light` even
 * in a dark backoffice — correct for the chrome, and wrong for anything reasoning about the
 * environment. This says what the backoffice is set to, full stop.
 *
 * The caller that needs it is a row of previews of *other* themes: each preview falls back to its
 * own theme's light palette by itself, so what it must be handed is the environment, not one
 * theme's outcome. Handed the outcome, a picker painted every miniature light whenever the selected
 * theme had no dark palette — invisible on four themes, which leave the window body on the
 * backoffice's own token, and glaring on macOS, which states it.
 *
 * **High contrast counts as dark** here, for the same reason it does below: it is the darkest thing
 * on offer, and a preview row under it should not be the one light thing on the screen.
 * @param umbThemeAlias The alias from Umbraco's own theme context.
 * @returns `dark` under the dark and high-contrast themes, `light` under anything else, an
 * unregistered alias included.
 */
export function backofficeVariant(umbThemeAlias: string): UmbraDesktopVariant {
  return umbThemeAlias === UMB_THEME_DARK_ALIAS || umbThemeAlias === UMB_THEME_HIGH_CONTRAST_ALIAS
    ? 'dark'
    : 'light';
}

/**
 * Decide which theme and variant to paint, from the user's stored choice and the backoffice's own
 * theme.
 *
 * High contrast picks the chosen theme's darkest palette rather than replacing the theme. It used
 * to force the Umbraco identity theme, on the reasoning that the high-contrast stylesheet works by
 * redefining `--uui-*` tokens and only that theme reads them. True, but it bought nothing: the
 * accessibility that matters is in the window *content*, and each window is a separate document
 * running Umbraco's own high-contrast stylesheet whichever chrome surrounds it. Throwing the
 * user's theme away only cost them their theme. A theme with no dark palette therefore looks the
 * same under all three backoffice themes, which is a fair trade until themes ship high-contrast
 * palettes of their own.
 *
 * An **unknown id** — a theme dropped in an upgrade — still falls back rather than leaving the
 * desktop unstyled.
 *
 * A caller that needs to tell a *deliberate* Umbraco choice from a silent fallback can compare
 * `request.themeId` with `result.theme.id`: they differ only when the stored id was not found.
 * @param request What to resolve: the user's stored theme id, Umbraco's own theme alias, and the
 * catalogue to choose from.
 * @returns The theme, variant and palette to apply.
 */
export function resolveTheme(request: UmbraDesktopThemeRequest): UmbraDesktopResolvedTheme {
  const { themeId, umbThemeAlias, catalogue } = request;

  // Fall back straight to the identity theme rather than looking `UMBRADESKTOP_DEFAULT_THEME_ID`
  // up in the catalogue: that keeps this robust even against an empty or broken catalogue.
  const theme = catalogue.find((entry) => entry.id === themeId) ?? UMBRADESKTOP_UMBRACO_THEME;
  const highContrast = umbThemeAlias === UMB_THEME_HIGH_CONTRAST_ALIAS;
  const wantsDark = backofficeVariant(umbThemeAlias) === 'dark';
  const dark = theme.palettes.dark;

  return wantsDark && dark
    ? { theme, variant: 'dark', palette: dark, highContrast }
    : { theme, variant: 'light', palette: theme.palettes.light, highContrast };
}
