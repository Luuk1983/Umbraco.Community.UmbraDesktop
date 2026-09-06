import type { UmbraDesktopSurface } from '../../types';
import { mountThemedWith } from '../mount-themed.js';
import type { UmbraDesktopThemedMount, UmbraDesktopUpdatable } from '../mount-themed.js';
import { UMBRADESKTOP_WIN11_THEME } from './index.js';
import { W11_DARK, W11_LIGHT } from './palette.js';

/**
 * This theme's binding of the shared mounting helper: the test files here all mount Windows 11
 * chrome, and none of them should have to restate which theme and which palette that means.
 *
 * The mounting itself, and the reasoning behind it, live one level up in `themes/mount-themed.ts`
 * — Umbraco 4 and macOS measure their own rendered geometry the same way, and a second copy of that
 * code is precisely the drift these tests exist to prevent.
 */

/** Re-exported so a test file needs only this module; see the shared helper for the reasoning. */
export { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from '../mount-themed.js';

/** Re-exported for the same reason: a test names the mount's shape without reaching past this. */
export type { UmbraDesktopThemedMount } from '../mount-themed.js';

/**
 * Mount a chrome component under the Windows 11 light palette with the Windows 11 stylesheet for
 * its surface adopted.
 * @param tag The chrome element to mount, e.g. `umbradesktop-window`.
 * @param surface Which of the theme's stylesheets belongs to it.
 * @returns The mounted element, its shadow root, and a teardown.
 */
export function mountThemed<T extends UmbraDesktopUpdatable>(
  tag: string,
  surface: UmbraDesktopSurface,
): Promise<UmbraDesktopThemedMount<T>> {
  return mountThemedWith<T>(UMBRADESKTOP_WIN11_THEME, W11_LIGHT, tag, surface);
}

/**
 * The same, under the **dark** palette.
 *
 * Only this theme and macOS ship two, and a second palette is a quiet thing to get wrong: it is a
 * spread of the light one with overrides, so a token misspelled in the override is simply absent
 * and the surface keeps its light value with nothing failing. Mounting the dark palette for real
 * and reading what the chrome paints is the only check that catches that.
 * @param tag The chrome element to mount, e.g. `umbradesktop-taskbar`.
 * @param surface Which of the theme's stylesheets belongs to it.
 * @returns The mounted element, its shadow root, and a teardown.
 */
export function mountThemedDark<T extends UmbraDesktopUpdatable>(
  tag: string,
  surface: UmbraDesktopSurface,
): Promise<UmbraDesktopThemedMount<T>> {
  return mountThemedWith<T>(UMBRADESKTOP_WIN11_THEME, W11_DARK, tag, surface);
}
