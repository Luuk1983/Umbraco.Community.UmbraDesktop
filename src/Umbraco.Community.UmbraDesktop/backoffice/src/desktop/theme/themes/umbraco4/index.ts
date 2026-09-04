import type { UmbraDesktopTheme } from '../../types';
import { U4_LIGHT } from './palette.js';
import {
  U4_CAPTION_KEEP_VISIBLE,
  U4_GRAB,
  U4_TASKBAR_HEIGHT,
  U4_TRAILING_CONTROLS_WIDTH,
} from './metrics.js';

/**
 * The 2009 Umbraco backoffice as desktop chrome: warm grey gradients, hairline panels, raised
 * buttons that press in, Verdana at 11px, and glossy section orbs in the launcher.
 *
 * It is the first theme whose source is a **web application rather than a desktop OS**, which
 * changes where each surface comes from. Two of them are close to literal — v4 kept its Sections
 * panel in the bottom-left corner, exactly where the launcher already anchors, and its content
 * tree is the natural home for a catalogue too long to draw as orbs. One is adapted: v4 never
 * shipped a modal with a titlebar, so the window frame is drawn from its content-pane header
 * instead. And one is invented outright — v4 had no taskbar, so the bar is built from v4's own
 * raised-button vocabulary, which makes it period-correct even though it is not copied from
 * anything.
 *
 * Window *bodies* stay Umbraco-styled and keep following the backoffice's own light/dark setting.
 * The desktop is what this theme skins; what runs inside a window is not its business.
 *
 * It ships no `desktop` stylesheet, for the same reason Win98 ships none: the wallpaper colour,
 * its gradient, the absent scrim and the watermark's opacity are all values, so all four go
 * through the palette. A sheet that existed only for symmetry with macOS would be a file to
 * maintain and nothing else.
 */
export const UMBRADESKTOP_UMBRACO4_THEME: UmbraDesktopTheme = {
  id: 'umbraco4',
  name: 'Umbraco 4',
  // Warm chrome grey, v4's link blue, and the white of a pane. Deliberately distant from the
  // Umbraco theme's navy-and-coral, which is the swatch it is most likely to be confused with in
  // a picker that now lists two Umbracos.
  swatch: { chrome: '#eeece7', accent: '#1b5e9c', surface: '#ffffff' },
  // Light only, like Win98. v4's warm grey is not a light-mode choice with a dark counterpart, it
  // is the design — so the chrome is identical under the backoffice's light, dark and
  // high-contrast settings, high contrast being painted with a theme's darkest available palette
  // and this being the only one. See `palette.ts`.
  palettes: { light: U4_LIGHT },
  metrics: {
    // See metrics.ts: every number below is derived from the constants the stylesheets and the
    // palette interpolate, rather than being a literal that can drift from what actually paints —
    // and `metrics.test.ts` measures the rendered chrome to check that the derivation is honest.
    titlebarHeight: U4_CAPTION_KEEP_VISIBLE,
    // Nothing sits at the header's leading end: like Win98 and unlike macOS, all four buttons
    // stay at the trailing end, so the drag clamp has nothing to reserve on the left.
    leadingControlsWidth: 0,
    trailingControlsWidth: U4_TRAILING_CONTROLS_WIDTH,
    grab: U4_GRAB,
    taskbarReserve: U4_TASKBAR_HEIGHT,
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
