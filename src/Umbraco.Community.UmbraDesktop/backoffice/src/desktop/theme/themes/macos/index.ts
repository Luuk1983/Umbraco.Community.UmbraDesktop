import type { UmbraDesktopTheme } from '../../types';
import { MACOS_DARK, MACOS_LIGHT } from './palette.js';

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
    titlebarHeight: 30,
    // Three 12px lights with 8px gaps and 10px of padding, then the reload button after a gap.
    leadingControlsWidth: 124,
    trailingControlsWidth: 0,
    grab: 80,
    // 44px dock plus its 10px bottom margin and a little clearance.
    taskbarReserve: 62,
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
