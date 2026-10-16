import type { UmbraDesktopSettings } from '../settings/types';
import type { UmbraDesktopTheme } from '../theme/types';
import { themeWallpaper } from '../theme/theme-wallpaper';

/**
 * What the wizard asks that the desktop settings keep.
 *
 * The language is not here: it is the user's Umbraco profile, saved the moment it is chosen, not a
 * desktop setting.
 */
export interface UmbraDesktopWelcomeChoices {
  /** The chosen theme's id. */
  theme: string;

  /** Whether the desktop should open when the user signs in. */
  bootIntoDesktop: boolean;
}

/**
 * The settings Done saves: the chosen theme, that theme's wallpaper, and the sign-in switch, merged
 * into the current settings for one write (design doc §3.5).
 *
 * The wallpaper is set **once** and `wallpaperFollowsTheme` is left as it is, which for a new user
 * is off (D10). A theme on the wrong wallpaper is a poor first look; turning the follow switch on
 * would mean the desktop manages the wallpaper for good, which nobody asked for here.
 *
 * A theme that declares no wallpaper keeps the current one, the same rule `themeWallpaper` states
 * for following the theme.
 * @param current The settings in force.
 * @param choices What the wizard ended on.
 * @param catalogue The themes to look the wallpaper up in.
 * @returns The settings to save.
 */
export function welcomeSettings(
  current: UmbraDesktopSettings,
  choices: UmbraDesktopWelcomeChoices,
  catalogue: ReadonlyArray<UmbraDesktopTheme>,
): UmbraDesktopSettings {
  return {
    ...current,
    theme: choices.theme,
    wallpaper: themeWallpaper(choices.theme, catalogue) ?? current.wallpaper,
    bootIntoDesktop: choices.bootIntoDesktop,
  };
}
