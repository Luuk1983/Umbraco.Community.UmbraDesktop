import type { UmbraDesktopTheme } from '../../types';
import { W11_DARK, W11_LIGHT } from './palette.js';
import {
  W11_CAPTION_KEEP_VISIBLE,
  W11_GRAB,
  W11_TASKBAR_HEIGHT,
  W11_TRAILING_CONTROLS_WIDTH,
} from './metrics.js';

/**
 * Windows 11 chrome: a flush acrylic taskbar with its buttons centred, 8px rounded windows with
 * square caption buttons at the trailing end, and Start as a fixed card floating above the bar.
 *
 * This is the theme most at risk of collapsing into another one. macOS is its nearest neighbour —
 * both are rounded, translucent, softly shadowed, and ship light and dark — so the differences
 * are deliberate rather than incidental: the bar is flush and full width instead of a floating
 * pill, the controls stay at the trailing end as full-height rectangles instead of becoming
 * traffic lights at the leading one, the caption is 32px against 40 with no hairline beneath it,
 * and the radius is 8px against 10. Seen side by side in the picker, those read.
 *
 * It is also the first theme that needed **no new geometry at all** for its window buttons:
 * `UMBRADESKTOP_CONTROL_WIDTH` is 46, and 46x32 is exactly what Windows 11 draws, so `metrics.ts`
 * takes the shared constants rather than restating them.
 *
 * Window *bodies* stay Umbraco-styled and keep following the backoffice's own light/dark setting,
 * as in every theme here. The desktop is what this skins.
 *
 * It ships no `desktop` stylesheet: the wallpaper colour, its gradient, the absent scrim and the
 * watermark's opacity are all values, so all four go through the palette.
 */
export const UMBRADESKTOP_WIN11_THEME: UmbraDesktopTheme = {
  id: 'win11',
  name: 'Windows 11',
  // Acrylic bar grey, the default Windows accent, and the white of a client area. A step apart
  // from macOS's pale grey and red traffic light, which is the swatch it sits nearest.
  swatch: { chrome: '#f3f3f3', accent: '#0078d4', surface: '#ffffff' },
  // Both variants, unlike Win98 and Umbraco 4. Dark mode is not a variant of Windows 11's light
  // mode, it is half of what people recognise — and it is what gives the backoffice's
  // high-contrast setting a sensible palette to paint with, since design D13 picks a theme's
  // darkest available one.
  palettes: { light: W11_LIGHT, dark: W11_DARK },
  metrics: {
    // See metrics.ts: derived from the constants the palette and the sheets interpolate, and
    // measured against the rendered chrome in metrics.test.ts.
    titlebarHeight: W11_CAPTION_KEEP_VISIBLE,
    // The controls stay at the trailing end, so the clamp reserves nothing at the leading one.
    leadingControlsWidth: 0,
    trailingControlsWidth: W11_TRAILING_CONTROLS_WIDTH,
    grab: W11_GRAB,
    taskbarReserve: W11_TASKBAR_HEIGHT,
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
