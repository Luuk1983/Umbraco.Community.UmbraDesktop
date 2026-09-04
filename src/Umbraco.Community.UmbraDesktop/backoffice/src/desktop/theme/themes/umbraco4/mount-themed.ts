import type { UmbraDesktopSurface } from '../../types';
import { mountThemedWith } from '../mount-themed.js';
import type { UmbraDesktopThemedMount, UmbraDesktopUpdatable } from '../mount-themed.js';
import { UMBRADESKTOP_UMBRACO4_THEME } from './index.js';
import { U4_LIGHT } from './palette.js';

/**
 * This theme's binding of the shared mounting helper: the test files here all mount Umbraco 4
 * chrome, and none of them should have to restate which theme and which palette that means.
 *
 * The mounting itself, and the reasoning behind it, live one level up in `themes/mount-themed.ts`
 * — Win98 and macOS measure their own rendered geometry the same way, and a second copy of that
 * code is precisely the drift these tests exist to prevent.
 */

/** Re-exported so a test file needs only this module; see the shared helper for the reasoning. */
export { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from '../mount-themed.js';

/** Re-exported for the same reason: a test names the mount's shape without reaching past this. */
export type { UmbraDesktopThemedMount } from '../mount-themed.js';

/**
 * Mount a chrome component under the Umbraco 4 light palette with the Umbraco 4 stylesheet for
 * its surface adopted.
 * @param tag The chrome element to mount, e.g. `umbradesktop-window`.
 * @param surface Which of the theme's stylesheets belongs to it.
 * @returns The mounted element, its shadow root, and a teardown.
 */
export function mountThemed<T extends UmbraDesktopUpdatable>(
  tag: string,
  surface: UmbraDesktopSurface,
): Promise<UmbraDesktopThemedMount<T>> {
  return mountThemedWith<T>(UMBRADESKTOP_UMBRACO4_THEME, U4_LIGHT, tag, surface);
}
