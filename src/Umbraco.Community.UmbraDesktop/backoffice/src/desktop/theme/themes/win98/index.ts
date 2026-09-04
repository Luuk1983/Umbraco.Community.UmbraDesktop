import type { UmbraDesktopTheme } from '../../types';
import { WIN98_LIGHT } from './palette.js';
import {
  WIN98_CAPTION_KEEP_VISIBLE,
  WIN98_GRAB,
  WIN98_TASKBAR_HEIGHT,
  WIN98_TRAILING_CONTROLS_WIDTH,
} from './metrics.js';

/**
 * Windows 98 chrome around Umbraco content: `#c0c0c0` everywhere, double bevels on every edge,
 * square corners, a navy gradient caption, and the launcher as a narrow Start menu opening from
 * the bottom-left corner.
 *
 * Window *bodies* stay Umbraco-styled and keep following the backoffice's own light/dark setting,
 * which is what an intranet app in a 1998 window frame would actually have looked like anyway.
 *
 * It ships no `desktop` stylesheet, unlike macOS. There is nothing structural to do to the desktop
 * surface here: the teal background, the flat (gradient-free) fill, the absent scrim and the
 * watermark's opacity are all values, so all four go through the palette. A sheet that only
 * existed for symmetry with the other themes would be a file to maintain and nothing else.
 */
export const UMBRADESKTOP_WIN98_THEME: UmbraDesktopTheme = {
  id: 'win98',
  name: 'Windows 98',
  // Button-face grey, the navy of an active caption, and the white of a client area. Two stripes
  // apart from both shipped themes: Umbraco leads on navy and accents in coral, macOS leads on a
  // much paler grey and accents in the red traffic light.
  swatch: { chrome: '#c0c0c0', accent: '#000080', surface: '#ffffff' },
  // Light only. Win98's grey is not a light-mode choice with a dark counterpart, it is the design,
  // so the chrome is identical under the backoffice's light, dark and high-contrast settings —
  // high contrast paints a theme with its darkest available palette, and this is the only one.
  // See `palette.ts`.
  palettes: { light: WIN98_LIGHT },
  metrics: {
    // See metrics.ts: every number below is derived from the constants the stylesheets
    // interpolate, rather than being a literal that can drift from what actually paints — and
    // `metrics.test.ts` measures the rendered chrome to check that the derivation is honest.
    titlebarHeight: WIN98_CAPTION_KEEP_VISIBLE,
    // Nothing sits at the caption's leading end: unlike macOS, Win98 keeps all four buttons at the
    // trailing end, so the drag clamp has nothing to reserve on the left. (Strictly, the frame's
    // 3px ring is not draggable either; leaving it out costs three pixels of the 80px grab budget
    // at the left edge, which is below the threshold of anything a user could notice.)
    leadingControlsWidth: 0,
    trailingControlsWidth: WIN98_TRAILING_CONTROLS_WIDTH,
    grab: WIN98_GRAB,
    taskbarReserve: WIN98_TASKBAR_HEIGHT,
  },
  sheets: async () => {
    const [taskbar, launcher, window] = await Promise.all([
      import('./taskbar.css.js'),
      import('./launcher.css.js'),
      import('./window.css.js'),
    ]);
    return {
      taskbar: taskbar.default,
      launcher: launcher.default,
      window: window.default,
    };
  },
};
