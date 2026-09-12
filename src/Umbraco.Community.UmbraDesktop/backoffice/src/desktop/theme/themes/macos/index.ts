import type { UmbraDesktopTheme } from '../../types';
import { MACOS_DARK, MACOS_LIGHT } from './palette.js';
import {
  MACOS_PATH_HEIGHT,
  MACOS_CAPTION_KEEP_VISIBLE,
  MACOS_CHROME_HEIGHT,
  MACOS_CHROME_WIDTH,
  MACOS_LEADING_CONTROLS_WIDTH,
  MACOS_TASKBAR_RESERVE,
} from './metrics.js';

/**
 * macOS chrome around Umbraco content: traffic lights, a floating dock, a Launchpad-style
 * fullscreen launcher. Window bodies stay Umbraco-styled, which is what a web app on a Mac looks
 * like anyway.
 */
export const UMBRADESKTOP_MACOS_THEME: UmbraDesktopTheme = {
  id: 'macos',
  name: 'macOS',
  descriptionKey: 'umbraDesktop_themeAboutMacos',
  palettes: { light: MACOS_LIGHT, dark: MACOS_DARK },
  metrics: {
    titlebarHeight: MACOS_CAPTION_KEEP_VISIBLE,
    // See metrics.ts: derived from the same constants window.css.ts renders its controls with,
    // rather than a hand-computed literal that can silently drift from what actually paints.
    leadingControlsWidth: MACOS_LEADING_CONTROLS_WIDTH,
    trailingControlsWidth: 0,
    grab: 80,
    // What an app's content box does not get. Nothing horizontally: the traffic lights are inside
    // the caption, so a theme moving its controls to the leading end changes the drag clamp above
    // and not this.
    chromeWidth: MACOS_CHROME_WIDTH,
    chromeHeight: MACOS_CHROME_HEIGHT,
    pathbarHeight: MACOS_PATH_HEIGHT,
    taskbarReserve: MACOS_TASKBAR_RESERVE,
  },
  sheets: async () => {
    const [desktop, taskbar, launcher, window] = await Promise.all([
      import('./desktop.css.js'),
      import('./taskbar.css.js'),
      import('./launcher.css.js'),
      import('./window.css.js'),
    ]);
    return {
      desktop: desktop.default,
      taskbar: taskbar.default,
      launcher: launcher.default,
      window: window.default,
    };
  },
  preview: async () => (await import('./preview.css.js')).default,
};
