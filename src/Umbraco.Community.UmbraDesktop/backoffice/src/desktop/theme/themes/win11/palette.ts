import type { UmbraDesktopPalette } from '../../types';
import {
  W11_LAUNCHER_GAP,
  W11_LAUNCHER_TOP_CLEARANCE,
  W11_LAUNCHER_WIDTH,
  W11_TASKBAR_HEIGHT,
  W11_TITLEBAR_HEIGHT,
  W11_WINDOW_BORDER,
} from './metrics.js';

/**
 * Segoe UI Variable is Windows 11's face and cannot be shipped, but Segoe UI is present on every
 * Windows install and is what the theme's audience will actually resolve to. The rest of the
 * stack is a sane system face elsewhere, so this looks most correct on Windows — an accepted
 * limitation, the same one the macOS and Win98 themes carry in the other direction.
 */
export const W11_FONT =
  '"Segoe UI Variable Text", "Segoe UI", -apple-system, system-ui, "Noto Sans", sans-serif';

/** Windows 11's default accent, and the colour of every selected or active affordance. */
export const W11_ACCENT = '#0078d4';

/** The accent as it appears on a dark ground, where the default is too dim to read as a marker. */
export const W11_ACCENT_DARK = '#4cc2ff';

/** Close, on hover: the one Windows caption button that changes hue rather than just filling. */
export const W11_CLOSE = '#c42b1c';

/**
 * The half of the launcher's centring that CSS can do on its own. The Start panel is a fixed-width
 * card centred on the *viewport*, and `--umbradesktop-launcher-left` is the only geometry channel
 * the base rule reads — so rather than a sheet fighting the base over `left`/`right`/`width`
 * (the over-constraint trap in `docs/theming.md` §5), the offset is computed here from the width
 * the palette itself declares. One token, no sheet rule, and the two can never disagree.
 */
const W11_LAUNCHER_LEFT = `calc(50vw - ${W11_LAUNCHER_WIDTH / 2}px)`;

/** How far the Start panel floats above the bottom edge: the bar, plus Windows 11's own gap. */
const W11_LAUNCHER_BOTTOM = W11_TASKBAR_HEIGHT + W11_LAUNCHER_GAP;

/**
 * Windows 11 in its light appearance.
 *
 * Two things here are doing most of the work of telling this theme apart from the macOS one,
 * which is its nearest neighbour in the picker and shares its rounded, translucent, soft-shadowed
 * language. The taskbar is **flush and full width** rather than a floating pill, and the window
 * controls stay at the **trailing** end as square full-height buttons rather than becoming
 * traffic lights at the leading one. The radius is 8px against macOS's 10, and the caption has no
 * hairline under it at all, because Win11's title area is the same plane as the window body.
 *
 * Note what is **not** here: `--umbradesktop-window-body-background` is deliberately left on its
 * Umbraco fallback, so window content keeps following the backoffice's own light/dark setting.
 * This theme skins the desktop, not what runs inside a window.
 */
export const W11_LIGHT: UmbraDesktopPalette = {
  '--umbradesktop-window-background': '#f3f3f3',
  '--umbradesktop-window-border': `${W11_WINDOW_BORDER}px solid rgba(0, 0, 0, 0.08)`,
  '--umbradesktop-window-radius': '8px',
  '--umbradesktop-window-shadow': '0 8px 20px rgba(0, 0, 0, 0.14)',
  '--umbradesktop-window-shadow-active': '0 16px 40px rgba(0, 0, 0, 0.24)',
  '--umbradesktop-titlebar-height': `${W11_TITLEBAR_HEIGHT}px`,
  // Mica: the caption is the same plane as the window body, with no gradient and no divider.
  '--umbradesktop-titlebar-background': '#f3f3f3',
  '--umbradesktop-titlebar-border-bottom': 'none',
  '--umbradesktop-titlebar-text': '#1a1a1a',
  // Windows fades an inactive caption's text rather than recolouring the bar, and does not touch
  // its buttons — but the base rule fades the controls with the title, so this stays gentle
  // enough that a control still reads as live. `window.css.ts` restores the buttons to full.
  '--umbradesktop-titlebar-inactive-opacity': '0.6',
  '--umbradesktop-control-color': '#1a1a1a',
  '--umbradesktop-control-hover-background': 'rgba(0, 0, 0, 0.06)',
  '--umbradesktop-control-close-hover-background': W11_CLOSE,
  '--umbradesktop-control-close-hover-color': '#ffffff',
  '--umbradesktop-taskbar-height': `${W11_TASKBAR_HEIGHT}px`,
  '--umbradesktop-taskbar-reserve': `${W11_TASKBAR_HEIGHT}px`,
  // Flush and full width. This one line is the clearest difference from the macOS dock.
  '--umbradesktop-taskbar-margin': '0',
  '--umbradesktop-taskbar-radius': '0',
  // Acrylic: a light tint over a heavy blur of whatever is behind it.
  '--umbradesktop-taskbar-background': 'rgba(243, 243, 243, 0.82)',
  '--umbradesktop-taskbar-background-opaque': '#f3f3f3',
  '--umbradesktop-taskbar-backdrop': 'blur(30px) saturate(140%)',
  '--umbradesktop-taskbar-border-top': '1px solid rgba(0, 0, 0, 0.06)',
  '--umbradesktop-taskbar-shadow': 'none',
  '--umbradesktop-taskbar-text': '#1a1a1a',
  '--umbradesktop-taskbar-text-emphasis': '#000000',
  '--umbradesktop-task-hover-background': 'rgba(0, 0, 0, 0.06)',
  '--umbradesktop-start-hover-background': 'rgba(0, 0, 0, 0.06)',
  '--umbradesktop-start-active-background': 'rgba(0, 0, 0, 0.09)',
  // The short accent bar under the focused window. The base rule draws it full width as an inset
  // shadow; `taskbar.css.ts` narrows it to a pill, and reads this same token for its colour.
  '--umbradesktop-task-active-marker': W11_ACCENT,
  '--umbradesktop-launcher-width': `${W11_LAUNCHER_WIDTH}px`,
  '--umbradesktop-launcher-left': W11_LAUNCHER_LEFT,
  '--umbradesktop-launcher-bottom': `${W11_LAUNCHER_BOTTOM}px`,
  '--umbradesktop-launcher-max-height': `calc(100vh - ${W11_LAUNCHER_BOTTOM + W11_LAUNCHER_TOP_CLEARANCE}px)`,
  '--umbradesktop-launcher-background': 'rgba(249, 249, 249, 0.9)',
  '--umbradesktop-launcher-backdrop': 'blur(40px) saturate(150%)',
  '--umbradesktop-launcher-border': '1px solid rgba(0, 0, 0, 0.07)',
  '--umbradesktop-launcher-radius': '8px',
  '--umbradesktop-launcher-shadow': '0 16px 48px rgba(0, 0, 0, 0.26)',
  '--umbradesktop-launcher-text': '#1a1a1a',
  '--umbradesktop-launcher-hover-background': 'rgba(0, 0, 0, 0.05)',
  '--umbradesktop-launcher-border-emphasis': W11_ACCENT,
  '--umbradesktop-launcher-search-radius': '4px',
  // Start has no visible cards — it is one surface with headings on it, so the group cards lose
  // their fill and their border entirely and keep only their spacing.
  '--umbradesktop-launcher-card-background': 'transparent',
  '--umbradesktop-launcher-card-border': 'none',
  '--umbradesktop-launcher-card-radius': '0',
  '--umbradesktop-launcher-pin-hover-background': 'rgba(0, 0, 0, 0.08)',
  '--umbradesktop-desktop-background-color': '#1c4b8a',
  // The bloom Windows 11 ships as its default wallpaper, as a gradient rather than the artwork.
  '--umbradesktop-desktop-background-image':
    'radial-gradient(120% 100% at 50% 42%, #4aa3e8 0%, #2464b4 42%, #14265e 100%)',
  '--umbradesktop-desktop-scrim': 'transparent',
  '--umbradesktop-desktop-watermark-opacity': '0.06',
};

/**
 * Windows 11 in its dark appearance, applied when the backoffice is in dark mode.
 *
 * Unlike Win98 and Umbraco 4, whose grey *is* the design and which therefore ship one palette,
 * dark mode is half of what people recognise as Windows 11 — so this theme is the second, after
 * macOS, to ship both. It is also what gives high contrast something sensible to paint with:
 * design D13 renders a theme in its **darkest available** palette under that setting, and a
 * light-only Win11 would have handed it a bright acrylic bar.
 */
export const W11_DARK: UmbraDesktopPalette = {
  ...W11_LIGHT,
  '--umbradesktop-window-background': '#202020',
  '--umbradesktop-window-border': `${W11_WINDOW_BORDER}px solid rgba(255, 255, 255, 0.09)`,
  '--umbradesktop-window-shadow': '0 8px 20px rgba(0, 0, 0, 0.45)',
  '--umbradesktop-window-shadow-active': '0 16px 40px rgba(0, 0, 0, 0.6)',
  '--umbradesktop-titlebar-background': '#202020',
  '--umbradesktop-titlebar-text': '#ffffff',
  '--umbradesktop-control-color': '#ffffff',
  '--umbradesktop-control-hover-background': 'rgba(255, 255, 255, 0.08)',
  '--umbradesktop-taskbar-background': 'rgba(32, 32, 32, 0.82)',
  '--umbradesktop-taskbar-background-opaque': '#202020',
  '--umbradesktop-taskbar-border-top': '1px solid rgba(255, 255, 255, 0.08)',
  '--umbradesktop-taskbar-text': '#ffffff',
  '--umbradesktop-taskbar-text-emphasis': '#ffffff',
  '--umbradesktop-task-hover-background': 'rgba(255, 255, 255, 0.08)',
  '--umbradesktop-start-hover-background': 'rgba(255, 255, 255, 0.08)',
  '--umbradesktop-start-active-background': 'rgba(255, 255, 255, 0.12)',
  // The default accent is too dim to read as a marker against a near-black bar; Windows uses a
  // lighter tint of it in dark mode for exactly this reason.
  '--umbradesktop-task-active-marker': W11_ACCENT_DARK,
  '--umbradesktop-launcher-background': 'rgba(44, 44, 44, 0.9)',
  '--umbradesktop-launcher-border': '1px solid rgba(255, 255, 255, 0.08)',
  '--umbradesktop-launcher-shadow': '0 16px 48px rgba(0, 0, 0, 0.5)',
  '--umbradesktop-launcher-text': '#ffffff',
  '--umbradesktop-launcher-hover-background': 'rgba(255, 255, 255, 0.07)',
  '--umbradesktop-launcher-border-emphasis': W11_ACCENT_DARK,
  '--umbradesktop-launcher-pin-hover-background': 'rgba(255, 255, 255, 0.1)',
  '--umbradesktop-desktop-background-color': '#0b1b3a',
  '--umbradesktop-desktop-background-image':
    'radial-gradient(120% 100% at 50% 42%, #1f5c96 0%, #12356e 45%, #060f2b 100%)',
};
