import type { UmbraDesktopSurface } from '../../types';
import { mountThemedWith } from '../mount-themed.js';
import type { UmbraDesktopThemedMount, UmbraDesktopUpdatable } from '../mount-themed.js';
import { UMBRADESKTOP_UMBRACO_THEME } from './index.js';
import { UMBRACO_PALETTE } from './palette.js';

/**
 * This theme's binding of the shared mounting helper, for the same reason the other themes have one:
 * every test file here mounts Umbraco chrome, and none of them should restate which theme, which
 * palette and which backoffice values that means.
 *
 * It adds one thing the others do not need: the backoffice's own tokens. The other palettes are
 * literal colours; this one points at `--uui-*`, so that it follows light, dark and a site's own
 * backoffice colours. A bare test page loads none of those, so they are supplied here, as the real
 * Umbraco light values, and a test can then assert the exact colour a frame ends up painted in.
 */

/** Re-exported so a test file needs only this module; see the shared helper for the reasoning. */
export { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from '../mount-themed.js';

/** Re-exported for the same reason: a test names the mount's shape without reaching past this. */
export type { UmbraDesktopThemedMount } from '../mount-themed.js';

/**
 * The Umbraco light-theme values the palette reads, as a `style` attribute fragment. Real values
 * (`uui-css`'s `colors.css`), so the colours a test asserts are the ones a backoffice paints.
 */
export const UMBRACO_TEST_BACKOFFICE_TOKENS = [
  '--uui-color-header-surface:#1b264f',
  '--uui-color-header-contrast:rgba(255,255,255,0.8)',
  '--uui-color-header-contrast-emphasis:#fff',
  '--uui-color-surface:#fff',
  '--uui-color-surface-alt:#f3f3f5',
  '--uui-color-surface-emphasis:#fafafa',
  '--uui-color-background:#f3f3f5',
  '--uui-color-current:#f5c1bc',
  '--uui-color-interactive:#1b264f',
  '--uui-color-interactive-emphasis:#3544b1',
  '--uui-color-border:#d8d7d9',
  '--uui-color-divider:#f6f6f7',
  '--uui-color-text:#060606',
  '--uui-color-danger:#c31d4c',
  '--uui-color-danger-standalone:#ae1e47',
  '--uui-color-warning-standalone:#a17700',
  '--uui-color-danger-contrast:#fff',
  '--uui-size-space-2:6px',
  '--uui-size-space-3:9px',
  '--uui-size-space-4:12px',
  '--uui-type-small-size:12px',
].join(';') + ';';

/**
 * Mount a chrome component under the Umbraco palette with the Umbraco stylesheet for its surface
 * adopted, on a page that has the backoffice tokens the palette reads.
 * @param tag The chrome element to mount, e.g. `umbradesktop-window`.
 * @param surface Which of the theme's stylesheets belongs to it.
 * @returns The mounted element, its shadow root, and a teardown.
 */
export function mountThemed<T extends UmbraDesktopUpdatable>(
  tag: string,
  surface: UmbraDesktopSurface,
): Promise<UmbraDesktopThemedMount<T>> {
  return mountThemedWith<T>(UMBRADESKTOP_UMBRACO_THEME, UMBRACO_PALETTE, tag, surface, UMBRACO_TEST_BACKOFFICE_TOKENS);
}
