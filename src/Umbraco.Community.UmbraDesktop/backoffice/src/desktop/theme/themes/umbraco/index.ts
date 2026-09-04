import type { UmbraDesktopTheme } from '../../types';
import { UMBRADESKTOP_TASKBAR_HEIGHT, UMBRADESKTOP_WINDOW_KEEP_VISIBLE } from '../../../constants';

/**
 * The desktop as it has always looked. Its palettes are deliberately **empty**: every token in the
 * chrome components carries today's value as its CSS fallback, so setting nothing renders exactly
 * what shipped before theming existed. That makes "the Umbraco theme is unchanged" a structural
 * guarantee rather than something to re-check by eye — and it follows the backoffice's own
 * light/dark setting for free, because those fallbacks are `--uui-*` values.
 *
 * Its metrics come from the constants the shell used before theming existed, rather than being
 * retyped here: those constants are still what the CSS fallbacks resolve to, so single-sourcing
 * them is what stops the two drifting apart.
 */
export const UMBRADESKTOP_UMBRACO_THEME: UmbraDesktopTheme = {
  id: 'umbraco',
  name: 'Umbraco',
  swatch: ['#1b264f', '#f5c1bc', '#ffffff'],
  palettes: { light: {} },
  metrics: {
    titlebarHeight: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.titlebar,
    leadingControlsWidth: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.leading,
    trailingControlsWidth: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.trailing,
    grab: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.grab,
    taskbarReserve: UMBRADESKTOP_TASKBAR_HEIGHT,
  },
};
