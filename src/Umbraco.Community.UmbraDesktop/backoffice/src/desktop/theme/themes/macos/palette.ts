import type { UmbraDesktopPalette } from '../../types';
import {
  MACOS_TASKBAR_BORDER,
  MACOS_TASKBAR_BOTTOM_MARGIN,
  MACOS_TASKBAR_HEIGHT,
  MACOS_TASKBAR_RESERVE,
  MACOS_TITLEBAR_BORDER,
  MACOS_TITLEBAR_HEIGHT,
  MACOS_WINDOW_BORDER,
} from './metrics.js';

/**
 * SF Pro cannot be shipped — licensing — so the stack resolves to the real thing on macOS and to
 * a sane system face elsewhere. The theme therefore looks most correct on a Mac, which is an
 * accepted limitation rather than a defect.
 */
export const MACOS_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

/** macOS in its light appearance. */
export const MACOS_LIGHT: UmbraDesktopPalette = {
  '--umbradesktop-window-background': '#ffffff',
  '--umbradesktop-window-body-background': '#ffffff',
  '--umbradesktop-window-border': `${MACOS_WINDOW_BORDER}px solid rgba(0, 0, 0, 0.16)`,
  '--umbradesktop-window-radius': '10px',
  '--umbradesktop-window-shadow': '0 8px 24px rgba(0, 0, 0, 0.22)',
  '--umbradesktop-window-shadow-active': '0 16px 40px rgba(0, 0, 0, 0.34)',
  '--umbradesktop-titlebar-height': `${MACOS_TITLEBAR_HEIGHT}px`,
  '--umbradesktop-titlebar-background': 'linear-gradient(#f8f8f8, #e8e8e8)',
  '--umbradesktop-titlebar-border-bottom': `${MACOS_TITLEBAR_BORDER}px solid #cfcfcf`,
  '--umbradesktop-titlebar-text': '#4d4d4d',
  '--umbradesktop-titlebar-inactive-opacity': '0.55',
  '--umbradesktop-control-color': '#4d4d4d',
  // The base window sheet's '.ctrl.close:hover' falls back to Umbraco's danger pink, which would
  // otherwise replace the macOS red traffic light on hover. macOS only darkens the light slightly
  // and reveals its glyph; it never changes hue. The glyph reads as a dark maroon on the deeper
  // red, matching how the close light's 'x' looks on a real Mac, rather than turning white the
  // way the Windows/KDE close affordance does.
  '--umbradesktop-control-close-hover-background': '#e04640',
  '--umbradesktop-control-close-hover-color': '#7a1610',
  // The other two lights (minimize/maximize) are also '.ctrl', so without this they'd pick up the
  // base '.ctrl:hover' grey tint on top of their own yellow/green fill — real macOS traffic
  // lights don't change colour on hover at all, only their glyph appears (handled separately by
  // '.titlebar:hover .glyph' in window.css.ts). Transparent keeps them exactly as they are.
  '--umbradesktop-control-hover-background': 'transparent',
  '--umbradesktop-taskbar-height': `${MACOS_TASKBAR_HEIGHT}px`,
  '--umbradesktop-taskbar-reserve': `${MACOS_TASKBAR_RESERVE}px`,
  '--umbradesktop-taskbar-margin': `0 auto ${MACOS_TASKBAR_BOTTOM_MARGIN}px`,
  '--umbradesktop-taskbar-radius': '16px',
  '--umbradesktop-taskbar-background': 'rgba(255, 255, 255, 0.4)',
  '--umbradesktop-taskbar-background-opaque': '#e9e9ef',
  '--umbradesktop-taskbar-backdrop': 'blur(20px) saturate(180%)',
  '--umbradesktop-taskbar-border-top': `${MACOS_TASKBAR_BORDER}px solid rgba(255, 255, 255, 0.55)`,
  '--umbradesktop-taskbar-shadow': '0 8px 22px rgba(0, 0, 0, 0.28)',
  '--umbradesktop-taskbar-text': '#2c2c2e',
  '--umbradesktop-taskbar-text-emphasis': '#000000',
  '--umbradesktop-task-hover-background': 'rgba(0, 0, 0, 0.08)',
  '--umbradesktop-start-hover-background': 'rgba(0, 0, 0, 0.08)',
  '--umbradesktop-start-active-background': 'rgba(0, 0, 0, 0.12)',
  '--umbradesktop-task-active-marker': '#3c3c3e',
  // Launchpad's surface is a *heavily* dimmed wallpaper, not a light tint over it, and that is
  // what makes white text on top of an arbitrary photograph legible. An earlier 0.62 alpha over a
  // pale wallpaper left the panel washed out and its group headings barely readable; going darker
  // and more opaque is what buys the contrast back. The saturation boost went with it — amplifying
  // the colours of whatever is behind the blur is the opposite of what this surface needs.
  '--umbradesktop-launcher-background': 'rgba(26, 24, 36, 0.8)',
  '--umbradesktop-launcher-backdrop': 'blur(30px) saturate(115%)',
  '--umbradesktop-launcher-border': 'none',
  '--umbradesktop-launcher-radius': '0',
  '--umbradesktop-launcher-shadow': 'none',
  '--umbradesktop-launcher-text': '#ffffff',
  '--umbradesktop-launcher-hover-background': 'rgba(255, 255, 255, 0.14)',
  '--umbradesktop-launcher-card-background': 'rgba(255, 255, 255, 0.1)',
  '--umbradesktop-launcher-card-border': '1px solid rgba(255, 255, 255, 0.16)',
  '--umbradesktop-launcher-card-radius': '12px',
  '--umbradesktop-desktop-background-color': '#3b6ea5',
  '--umbradesktop-desktop-background-image':
    'linear-gradient(155deg, #4a3f78 0%, #3b6ea5 55%, #2f8f96 100%)',
  '--umbradesktop-desktop-scrim': 'rgba(0, 0, 0, 0.1)',
  '--umbradesktop-desktop-watermark-opacity': '0.05',
};

/** macOS in its dark appearance, applied when the backoffice is in dark mode. */
export const MACOS_DARK: UmbraDesktopPalette = {
  ...MACOS_LIGHT,
  '--umbradesktop-window-background': '#2b2b2e',
  '--umbradesktop-window-body-background': '#242427',
  '--umbradesktop-window-border': `${MACOS_WINDOW_BORDER}px solid rgba(255, 255, 255, 0.12)`,
  '--umbradesktop-window-shadow': '0 8px 24px rgba(0, 0, 0, 0.45)',
  '--umbradesktop-window-shadow-active': '0 16px 40px rgba(0, 0, 0, 0.6)',
  '--umbradesktop-titlebar-background': 'linear-gradient(#3a3a3d, #323235)',
  '--umbradesktop-titlebar-border-bottom': `${MACOS_TITLEBAR_BORDER}px solid rgba(0, 0, 0, 0.5)`,
  '--umbradesktop-titlebar-text': '#d0d0d2',
  '--umbradesktop-control-color': '#d0d0d2',
  '--umbradesktop-taskbar-background': 'rgba(28, 28, 32, 0.7)',
  '--umbradesktop-taskbar-background-opaque': '#1c1c20',
  '--umbradesktop-taskbar-border-top': `${MACOS_TASKBAR_BORDER}px solid rgba(255, 255, 255, 0.18)`,
  '--umbradesktop-taskbar-text': '#e8e8ea',
  '--umbradesktop-taskbar-text-emphasis': '#ffffff',
  '--umbradesktop-task-hover-background': 'rgba(255, 255, 255, 0.12)',
  '--umbradesktop-start-hover-background': 'rgba(255, 255, 255, 0.12)',
  '--umbradesktop-start-active-background': 'rgba(255, 255, 255, 0.18)',
  '--umbradesktop-task-active-marker': '#ffffff',
  '--umbradesktop-desktop-background-color': '#1d3550',
  '--umbradesktop-desktop-background-image':
    'linear-gradient(155deg, #2a2340 0%, #1d3550 55%, #17414a 100%)',
};
