import type { UmbraDesktopPalette } from '../../types';
import {
  WIN98_CONTROL_WIDTH,
  WIN98_LAUNCHER_TOP_CLEARANCE,
  WIN98_LAUNCHER_WIDTH,
  WIN98_TASKBAR_HEIGHT,
  WIN98_TITLEBAR_HEIGHT,
} from './metrics.js';

/**
 * MS Sans Serif cannot be shipped — it is a Microsoft bitmap face, and nothing free is a
 * substitute for it — so the stack asks for the real thing first (present on Windows, where most
 * of this theme's audience is), then its TrueType successor, then Tahoma, which is what Windows
 * 2000 replaced it with and is metrically the closest widely installed face. The theme therefore
 * looks most correct on Windows, which is an accepted limitation rather than a defect.
 */
export const WIN98_FONT = '"MS Sans Serif", "Microsoft Sans Serif", Tahoma, Verdana, sans-serif';

/** `COLOR_3DFACE` — the grey every piece of Win98 chrome is made of. */
export const WIN98_FACE = '#c0c0c0';

/** `COLOR_3DHILIGHT` — the brightest bevel edge, facing the light. */
export const WIN98_HILIGHT = '#ffffff';

/**
 * `COLOR_3DLIGHT` — the inner lit edge, a step down from the highlight. Named `_EDGE` because
 * `WIN98_LIGHT` is the palette itself, following the `MACOS_LIGHT` naming the other themes use for
 * their light variant.
 */
export const WIN98_LIGHT_EDGE = '#dfdfdf';

/** `COLOR_3DSHADOW` — the inner shaded edge. */
export const WIN98_SHADOW = '#808080';

/** `COLOR_3DDKSHADOW` — the outermost shaded edge. */
export const WIN98_DKSHADOW = '#000000';

/** `COLOR_WINDOWTEXT` / `COLOR_BTNTEXT` — black on grey, everywhere. */
export const WIN98_TEXT = '#000000';

/** `COLOR_WINDOW` — the white of a text field or a document area. */
export const WIN98_WINDOW = '#ffffff';

/**
 * `COLOR_ACTIVECAPTION` to `COLOR_GRADIENTACTIVECAPTION`. Windows 98 turned the gradient caption
 * on by default, which is the single clearest tell that this is 98 rather than 95.
 */
export const WIN98_ACTIVE_CAPTION = 'linear-gradient(to right, #000080, #1084d0)';

/** `COLOR_INACTIVECAPTION` — a flat grey caption, with no gradient. */
export const WIN98_INACTIVE_CAPTION = '#808080';

/** `COLOR_CAPTIONTEXT` — white on the navy caption. */
export const WIN98_CAPTION_TEXT = '#ffffff';

/** `COLOR_INACTIVECAPTIONTEXT` — button face on the grey caption, which is deliberately low contrast. */
export const WIN98_INACTIVE_CAPTION_TEXT = '#c0c0c0';

/** `COLOR_HIGHLIGHT` — the navy bar behind the menu item under the pointer. */
export const WIN98_MENU_HILIGHT = '#000080';

/** `COLOR_HIGHLIGHTTEXT` — white, on that navy bar. */
export const WIN98_MENU_HILIGHT_TEXT = '#ffffff';

/** `COLOR_BACKGROUND` — the teal a freshly installed Windows 98 desktop is painted. */
export const WIN98_DESKTOP = '#008080';

/**
 * A raised Win98 edge: a button, a window frame, a menu panel. Four layered `inset` box-shadows
 * paint the double bevel on all four sides at once — highlight and light leading, dark shadow and
 * shadow trailing — with no extra DOM and no per-side borders to keep in sync.
 *
 * The order matters and is the reverse of what reading it suggests: the *first* shadow in the list
 * paints on top, so the 1px outer pair has to be listed before the 2px inner pair or the inner
 * pair covers it.
 */
export const WIN98_BEVEL_RAISED =
  `inset -1px -1px ${WIN98_DKSHADOW}, inset 1px 1px ${WIN98_HILIGHT}, ` +
  `inset -2px -2px ${WIN98_SHADOW}, inset 2px 2px ${WIN98_LIGHT_EDGE}`;

/** The same edge with the light coming from the other corner: a button being held down. */
export const WIN98_BEVEL_PRESSED =
  `inset -1px -1px ${WIN98_HILIGHT}, inset 1px 1px ${WIN98_DKSHADOW}, ` +
  `inset -2px -2px ${WIN98_LIGHT_EDGE}, inset 2px 2px ${WIN98_SHADOW}`;

/**
 * A sunken well rather than a pressed button: a text field, a client area, the clock's tray. The
 * difference from {@link WIN98_BEVEL_PRESSED} is which pair carries the darkest pixel — a well is
 * darkest on its *inner* leading edge, a held button on its outer one.
 */
export const WIN98_BEVEL_SUNKEN =
  `inset -1px -1px ${WIN98_HILIGHT}, inset 1px 1px ${WIN98_SHADOW}, ` +
  `inset -2px -2px ${WIN98_LIGHT_EDGE}, inset 2px 2px ${WIN98_DKSHADOW}`;

/**
 * Windows 98, in the only appearance it has.
 *
 * There is no dark variant on purpose. Win98's grey is not a light-mode choice with a dark
 * counterpart — it is the design — so the chrome renders identically under the backoffice's light,
 * dark and high-contrast settings, while the window *content* follows whichever of the three is in
 * force, because each window is a separate document running Umbraco's own stylesheet.
 *
 * Note what is **not** here: `--umbradesktop-window-body-background` is deliberately left on its
 * Umbraco fallback so window content keeps following the backoffice, and
 * `--umbradesktop-task-active-marker` is left unset because `taskbar.css.ts` replaces the coral
 * underline it feeds with a pressed, dithered button.
 */
export const WIN98_LIGHT: UmbraDesktopPalette = {
  // The frame is grey; its raised bevel and the padding that reveals it live in `window.css.ts`,
  // where the two can be kept in step (see WIN98_FRAME_BORDER).
  '--umbradesktop-window-background': WIN98_FACE,
  '--umbradesktop-window-border': 'none',
  '--umbradesktop-window-radius': '0',
  '--umbradesktop-titlebar-height': `${WIN98_TITLEBAR_HEIGHT}px`,
  '--umbradesktop-titlebar-background': WIN98_ACTIVE_CAPTION,
  '--umbradesktop-titlebar-border-bottom': 'none',
  '--umbradesktop-titlebar-text': WIN98_CAPTION_TEXT,
  // Win98 marks an inactive window by recolouring its caption, not by fading it: the buttons on an
  // inactive window are as crisp and as clickable as on an active one. Neutralising the base rule
  // here rather than in the sheet is what lets `window.css.ts` simply state the two colours.
  '--umbradesktop-titlebar-inactive-opacity': '1',
  '--umbradesktop-control-width': `${WIN98_CONTROL_WIDTH}px`,
  '--umbradesktop-control-color': WIN98_TEXT,
  // Win98 buttons do not respond to hover at all — they respond to being pressed, which
  // `window.css.ts` handles with the pressed bevel. Pinning both hover fills to the button face
  // keeps them inert, including the close button, which never turns red here.
  '--umbradesktop-control-hover-background': WIN98_FACE,
  '--umbradesktop-control-close-hover-background': WIN98_FACE,
  '--umbradesktop-control-close-hover-color': WIN98_TEXT,
  '--umbradesktop-taskbar-height': `${WIN98_TASKBAR_HEIGHT}px`,
  // Flush with the bottom edge, so the bar occupies exactly its own height. Stated rather than
  // left to the desktop's `reserve: var(--taskbar-height)` chain, which would give the same answer
  // — it is worth being explicit that this theme has no floating gap to account for.
  '--umbradesktop-taskbar-reserve': `${WIN98_TASKBAR_HEIGHT}px`,
  '--umbradesktop-taskbar-margin': '0',
  '--umbradesktop-taskbar-radius': '0',
  '--umbradesktop-taskbar-background': WIN98_FACE,
  '--umbradesktop-taskbar-background-opaque': WIN98_FACE,
  // 1998 had no compositor. An opaque bar over the wallpaper is the point, not a limitation.
  '--umbradesktop-taskbar-backdrop': 'none',
  '--umbradesktop-taskbar-border-top': `1px solid ${WIN98_HILIGHT}`,
  '--umbradesktop-taskbar-shadow': 'none',
  '--umbradesktop-taskbar-text': WIN98_TEXT,
  '--umbradesktop-taskbar-text-emphasis': WIN98_TEXT,
  // Inert, for the same reason as the window controls: a Win98 taskbar button reacts to a press,
  // not to a hover.
  '--umbradesktop-task-hover-background': WIN98_FACE,
  '--umbradesktop-start-hover-background': WIN98_FACE,
  '--umbradesktop-start-active-background': WIN98_FACE,
  '--umbradesktop-launcher-width': `${WIN98_LAUNCHER_WIDTH}px`,
  // Hard against the left edge, directly above the bar, the way the Start menu opens.
  '--umbradesktop-launcher-left': '0',
  '--umbradesktop-launcher-max-height': `calc(100vh - ${WIN98_TASKBAR_HEIGHT + WIN98_LAUNCHER_TOP_CLEARANCE}px)`,
  '--umbradesktop-launcher-background': WIN98_FACE,
  '--umbradesktop-launcher-backdrop': 'none',
  '--umbradesktop-launcher-border': 'none',
  '--umbradesktop-launcher-radius': '0',
  // A menu is a raised panel, not an elevated card. The panel's own `padding` in
  // `launcher.css.ts` is what leaves this bevel somewhere to paint.
  '--umbradesktop-launcher-shadow': WIN98_BEVEL_RAISED,
  '--umbradesktop-launcher-text': WIN98_TEXT,
  // The navy selection bar every Win98 menu draws behind the item under the pointer. The white
  // text that has to go with it is in `launcher.css.ts`, which has no token.
  '--umbradesktop-launcher-hover-background': WIN98_MENU_HILIGHT,
  '--umbradesktop-launcher-search-radius': '0',
  '--umbradesktop-launcher-card-background': WIN98_FACE,
  '--umbradesktop-launcher-card-border': 'none',
  '--umbradesktop-launcher-card-radius': '0',
  '--umbradesktop-launcher-pin-hover-background': WIN98_FACE,
  '--umbradesktop-desktop-background-color': WIN98_DESKTOP,
  // Flat teal, with no gradient: this is the desktop of a machine nobody has personalised yet.
  '--umbradesktop-desktop-background-image': 'none',
  // No scrim over a wallpaper either — Win98 never dimmed one, and the chrome is opaque enough
  // not to need the help.
  '--umbradesktop-desktop-scrim': 'transparent',
  '--umbradesktop-desktop-watermark-opacity': '0.08',
};
