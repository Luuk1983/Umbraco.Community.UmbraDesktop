import { expect } from '@open-wc/testing';
import { welcomeSettings } from './choices';
import { UMBRADESKTOP_DEFAULT_SETTINGS } from '../settings/settings-store';
import { UMBRADESKTOP_THEMES } from '../theme/themes/index';
import { themeWallpaper } from '../theme/theme-wallpaper';
import type { UmbraDesktopTheme } from '../theme/types';

/**
 * What Done saves: the theme, that theme's wallpaper, and the sign-in switch, as one set of settings
 * for one write (design doc §3.5, D10).
 */

it('keeps the defaults when nothing was changed', () => {
  const settings = welcomeSettings(
    UMBRADESKTOP_DEFAULT_SETTINGS,
    { theme: UMBRADESKTOP_DEFAULT_SETTINGS.theme, bootIntoDesktop: false },
    UMBRADESKTOP_THEMES,
  );

  expect(settings.theme).to.equal(UMBRADESKTOP_DEFAULT_SETTINGS.theme);
  expect(settings.bootIntoDesktop).to.equal(false);
  expect(settings.wallpaper).to.deep.equal(themeWallpaper(UMBRADESKTOP_DEFAULT_SETTINGS.theme, UMBRADESKTOP_THEMES));
});

it('gives every shipped theme its own wallpaper', () => {
  for (const theme of UMBRADESKTOP_THEMES) {
    const settings = welcomeSettings(UMBRADESKTOP_DEFAULT_SETTINGS, { theme: theme.id, bootIntoDesktop: false }, UMBRADESKTOP_THEMES);

    expect(settings.theme, theme.id).to.equal(theme.id);
    expect(settings.wallpaper, theme.id).to.deep.equal(theme.wallpaper);
  }
});

it('sets the wallpaper once, without leaving it following the theme', () => {
  const settings = welcomeSettings(UMBRADESKTOP_DEFAULT_SETTINGS, { theme: 'macos', bootIntoDesktop: false }, UMBRADESKTOP_THEMES);

  expect(settings.wallpaperFollowsTheme).to.equal(false);
});

it('keeps the current wallpaper for a theme that declares none', () => {
  const bare: UmbraDesktopTheme = { ...UMBRADESKTOP_THEMES[0], id: 'bare', wallpaper: undefined };

  const settings = welcomeSettings(UMBRADESKTOP_DEFAULT_SETTINGS, { theme: 'bare', bootIntoDesktop: false }, [bare]);

  expect(settings.wallpaper).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper);
});

it('records the sign-in switch', () => {
  const settings = welcomeSettings(UMBRADESKTOP_DEFAULT_SETTINGS, { theme: 'win11', bootIntoDesktop: true }, UMBRADESKTOP_THEMES);

  expect(settings.bootIntoDesktop).to.equal(true);
});

it('leaves every other setting as it was', () => {
  const current = { ...UMBRADESKTOP_DEFAULT_SETTINGS, pinned: ['a', 'b'] };

  const settings = welcomeSettings(current, { theme: 'win98', bootIntoDesktop: false }, UMBRADESKTOP_THEMES);

  expect(settings.pinned).to.deep.equal(['a', 'b']);
  expect(settings.reopenWindows).to.equal(current.reopenWindows);
});
