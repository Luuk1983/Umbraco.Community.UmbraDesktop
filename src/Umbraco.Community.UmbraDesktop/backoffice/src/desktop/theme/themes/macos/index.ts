import type { UmbraDesktopTheme } from '../../types';
import { MACOS_DARK, MACOS_LIGHT } from './palette.js';
import { MACOS_CAPTION_KEEP_VISIBLE, MACOS_LEADING_CONTROLS_WIDTH, MACOS_TASKBAR_RESERVE } from './metrics.js';

/**
 * macOS chrome around Umbraco content: traffic lights, a floating dock, a Launchpad-style
 * fullscreen launcher. Window bodies stay Umbraco-styled, which is what a web app on a Mac looks
 * like anyway.
 */
export const UMBRADESKTOP_MACOS_THEME: UmbraDesktopTheme = {
  id: 'macos',
  name: 'macOS',
  swatch: { chrome: '#e8e8ea', accent: '#ff5f57', surface: '#ffffff' },
  palettes: { light: MACOS_LIGHT, dark: MACOS_DARK },
  metrics: {
    titlebarHeight: MACOS_CAPTION_KEEP_VISIBLE,
    // See metrics.ts: derived from the same constants window.css.ts renders its controls with,
    // rather than a hand-computed literal that can silently drift from what actually paints.
    leadingControlsWidth: MACOS_LEADING_CONTROLS_WIDTH,
    trailingControlsWidth: 0,
    grab: 80,
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
};
