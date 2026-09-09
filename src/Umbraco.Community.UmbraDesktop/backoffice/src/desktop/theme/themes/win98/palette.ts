import type { UmbraDesktopPalette } from '../../types';
import {
  WIN98_PATH_HEIGHT,
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
 * Muted body text, and the one colour in this file that is **not** what Windows 98 shipped.
 *
 * Windows' own `COLOR_GRAYTEXT` was `#808080`, the same value as `COLOR_3DSHADOW`. On
 * `COLOR_3DFACE` that is 2.17:1, and on `COLOR_WINDOW` 3.95:1 — both under WCAG AA's 4.5:1 for
 * body text. The authentic look was never really that pair on its own: Windows drew disabled text
 * as an engraved pair, the grey offset by a white shadow one pixel down and right, and the notch
 * that produces is what made it legible. This contract is one colour per token and cannot express
 * a second offset layer, so the honest option is a darker grey. `#4d4d4d` is 4.65:1 on the face
 * and 8.45:1 on the window, still unmistakably a dimmed grey next to `WIN98_TEXT`'s black.
 *
 * It is a separate constant rather than a changed {@link WIN98_SHADOW} deliberately. Reusing the
 * bevel colour coupled body text to the inner shaded edge of every raised control, so tuning a
 * bevel would have silently moved the readability of an app's secondary text. The bevel keeps its
 * authentic `#808080`, because a bevel is decoration and not something anybody has to read.
 */
export const WIN98_GRAY_TEXT = '#4d4d4d';

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
  '--umbradesktop-path-height': `${WIN98_PATH_HEIGHT}px`,
  // A sunken well on the face, as this theme draws every read-only field. The crumbs are the
  // system link navy of the era, and the hover is the selection blue rather than a tint.
  '--umbradesktop-path-background': WIN98_FACE,
  '--umbradesktop-path-border-bottom': 'none',
  '--umbradesktop-path-text': WIN98_TEXT,
  '--umbradesktop-path-link': '#000080',
  '--umbradesktop-path-link-hover-background': '#000080',
  '--umbradesktop-path-separator': '#404040',
  '--umbradesktop-path-font-size': '11px',
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

  // Apps. Win98 is the theme the app token group was shaped around: `edge-width: 2px` with
  // `radius: 0` is what makes a plain app stylesheet render as a bevelled control here and as a
  // flat rounded one everywhere else, with no branch in the app.
  '--umbradesktop-app-surface': WIN98_FACE,
  '--umbradesktop-app-surface-raised': WIN98_FACE,
  '--umbradesktop-app-surface-sunken': WIN98_WINDOW,
  '--umbradesktop-app-edge-light': WIN98_HILIGHT,
  '--umbradesktop-app-edge-dark': WIN98_SHADOW,
  // The black outer ring, not `WIN98_SHADOW`: a boundary has to clear 3:1 on the button face as
  // well as in a white field, and the shadow grey manages 2.17:1 on its own face. Black is what
  // this operating system ruled a list box and a grid with anyway. Minesweeper never shows it —
  // its cells are butted bevels and its branch paints the gaps between them in face grey — but an
  // app that draws a plain divider gets a Win98 divider.
  '--umbradesktop-app-border': WIN98_DKSHADOW,
  '--umbradesktop-app-edge-width': '2px',
  // Square corners. `0px` and not `0`, and that unit is load-bearing rather than tidiness: a bare
  // `0` is a valid length on its own but **invalid inside `calc()`, `min()` or `max()`**, which
  // drops the whole declaration silently. The chrome's own tokens can get away with a unitless
  // zero because both ends of that contract are in this repository; an app token's reader ships in
  // a package this repository cannot inspect, and Minesweeper lost its entire `border` shorthand
  // to exactly this. `app-tokens.test.ts` now fails on any unitless app token, so this cannot be
  // undone by accident.
  '--umbradesktop-app-radius': '0px',
  '--umbradesktop-app-text': WIN98_TEXT,
  // Not `WIN98_SHADOW`, despite Windows using one value for both: see {@link WIN98_GRAY_TEXT}.
  '--umbradesktop-app-text-muted': WIN98_GRAY_TEXT,
  '--umbradesktop-app-accent': WIN98_MENU_HILIGHT,
  // `COLOR_HIGHLIGHTTEXT` is literally the answer this token asks for: the colour Windows itself
  // wrote on `COLOR_HIGHLIGHT`. White on that navy is 16:1, the widest margin of any theme here.
  '--umbradesktop-app-accent-text': WIN98_MENU_HILIGHT_TEXT,
  '--umbradesktop-app-font': WIN98_FONT,

  // The 16-colour palette has no modern warning colour, so the two severities above `info` borrow
  // its dark yellow and dark red rather than a `uui-color-warning`/`-danger` this theme never had.
  // There is no dark variant to repeat these in — see the note above about Win98 shipping light
  // only.
  '--umbradesktop-notice-warning-color': '#808000',
  '--umbradesktop-notice-error-color': '#800000',
};
