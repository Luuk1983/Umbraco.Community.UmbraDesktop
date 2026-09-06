import type { UmbraDesktopPalette } from '../../types';
import {
  U4_CONTROL_WIDTH,
  U4_LAUNCHER_TOP_CLEARANCE,
  U4_LAUNCHER_WIDTH,
  U4_TASKBAR_HEIGHT,
  U4_TITLEBAR_HEIGHT,
} from './metrics.js';

/**
 * Verdana is what the 2009 backoffice was set in, and it is one of the few faces that is actually
 * present on Windows and macOS alike — so unlike the Win98 theme, which has to ask for a bitmap
 * face it cannot ship, this stack gets the real thing almost everywhere. Tahoma covers the older
 * Windows installs that lack it, and DejaVu Sans is the closest widely installed Linux face.
 */
export const U4_FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", sans-serif';

/** The warm grey every piece of v4 chrome is made of — the toolbars, the tab strip, the buttons. */
export const U4_FACE = '#eeece7';

/** The top of a raised gradient, where the light falls. */
export const U4_FACE_LIT = '#fbfaf7';

/** The bottom of a raised gradient, where it falls away. */
export const U4_FACE_DIM = '#ddd9d0';

/** The panel a pane's contents sit on: a half-step lighter than the chrome around it. */
export const U4_PANEL = '#f8f7f4';

/** The white of a text field, a tree, or any other sunken well. */
export const U4_WELL = '#ffffff';

/** The hairline v4 drew around every panel, pane and field. */
export const U4_LINE = '#b4afa4';

/** The lighter hairline used between rows inside a panel, where a full-strength line would shout. */
export const U4_LINE_SOFT = '#d3cec3';

/** The border of anything raised — a button, the taskbar's task buttons, the launcher panel. */
export const U4_EDGE = '#9d988e';

/** The heavier border of a window frame and the launcher, which sit above the desktop. */
export const U4_EDGE_STRONG = '#8f8a80';

/** The 1px of white along a raised edge's top, which is what makes it read as raised at all. */
export const U4_HILIGHT = '#ffffff';

/** Body text: near-black, warmed very slightly to sit on a warm grey rather than fight it. */
export const U4_TEXT = '#2c2a26';

/** Secondary text — a property label, a dimmed glyph. */
export const U4_TEXT_SOFT = '#6b675f';

/** The pale blue v4 filled a selected tree row with. */
export const U4_SELECT = '#cfe3f5';

/** The border around that selection, which is what stops it reading as a smudge. */
export const U4_SELECT_LINE = '#7ba7d4';

/**
 * A raised v4 surface: a button, the taskbar, a pane header. Three stops rather than two — the
 * midpoint at 48% is what gives the era's gradients their distinctive slightly-glassy break,
 * instead of the flat linear ramp a two-stop gradient draws.
 */
export const U4_RAISED = `linear-gradient(180deg, ${U4_FACE_LIT} 0%, #f1efea 48%, ${U4_FACE_DIM} 100%)`;

/** The same surface held down: the ramp inverted and darkened, as a pressed 2009 button was drawn. */
export const U4_PRESSED = 'linear-gradient(180deg, #d9d5cc 0%, #e9e6df 100%)';

/** The taskbar's own gradient, a touch cooler and taller than a button's. */
export const U4_BAR = 'linear-gradient(180deg, #f7f6f2 0%, #ebe8e2 45%, #dcd8d0 100%)';

/** The blue-filled, pressed state of the task button belonging to the focused window. */
export const U4_TASK_ACTIVE = 'linear-gradient(180deg, #dbe6f2 0%, #c3d5ea 100%)';

/** Close, on hover: the one place this theme raises its voice. */
export const U4_CLOSE_HOVER = 'linear-gradient(180deg, #d4574a 0%, #b23a2d 100%)';

/**
 * The soft blue-grey field a v4-era desktop would have been painted. Invented rather than
 * sourced — none of the reference screenshots show a desktop, because v4 was a web application
 * and never had one. It is the easiest thing in this theme to change later.
 */
export const U4_DESKTOP = '#c6ceda';

/** The gradient over that field, lighter at the top the way every 2009 background was. */
export const U4_DESKTOP_IMAGE = 'linear-gradient(180deg, #dbe1e8 0%, #bcc6d3 100%)';

/**
 * Umbraco 4, in the only appearance it has.
 *
 * There is no dark variant, for the same reason Win98 has none: v4's warm grey is not a
 * light-mode choice with a dark counterpart, it is the design. The chrome therefore renders
 * identically under the backoffice's light, dark and high-contrast settings, while the window
 * *content* follows whichever of the three is in force, because each window is a separate
 * document running Umbraco's own stylesheet.
 *
 * Note what is **not** here. `--umbradesktop-window-body-background` stays on its Umbraco
 * fallback so window content keeps following the backoffice — this theme styles the desktop, not
 * what runs inside it. `--umbradesktop-task-active-marker` is left unset because `taskbar.css.ts`
 * replaces the coral underline it feeds with a pressed, blue-filled button, which is how a 2009
 * taskbar marked the focused window.
 */
export const U4_LIGHT: UmbraDesktopPalette = {
  '--umbradesktop-window-background': U4_PANEL,
  '--umbradesktop-window-border': `1px solid ${U4_EDGE_STRONG}`,
  // Barely rounded. v4 was square everywhere except its tab corners, but a hard 0 next to the
  // macOS theme's 10px reads as a rendering fault rather than a choice.
  '--umbradesktop-window-radius': '3px',
  '--umbradesktop-window-shadow': '0 4px 14px rgba(28, 36, 48, 0.22)',
  '--umbradesktop-window-shadow-active': '0 6px 20px rgba(28, 36, 48, 0.32)',
  '--umbradesktop-titlebar-height': `${U4_TITLEBAR_HEIGHT}px`,
  '--umbradesktop-titlebar-background': U4_RAISED,
  '--umbradesktop-titlebar-border-bottom': `1px solid ${U4_LINE}`,
  '--umbradesktop-titlebar-text': U4_TEXT,
  // Like Win98, this theme marks an inactive window by recolouring its header rather than fading
  // it, so the buttons on an inactive window stay as crisp and as clickable as on an active one.
  // Neutralising the base rule here is what lets `window.css.ts` simply state the two treatments.
  '--umbradesktop-titlebar-inactive-opacity': '1',
  '--umbradesktop-control-width': `${U4_CONTROL_WIDTH}px`,
  '--umbradesktop-control-color': '#57534b',
  // A flat glyph that raises into a button under the pointer. The fill is the token; the 1px edge
  // and the inset highlight that make it a *button* have no tokens and live in `window.css.ts`.
  '--umbradesktop-control-hover-background': U4_RAISED,
  '--umbradesktop-control-close-hover-background': U4_CLOSE_HOVER,
  '--umbradesktop-control-close-hover-color': U4_WELL,
  '--umbradesktop-taskbar-height': `${U4_TASKBAR_HEIGHT}px`,
  // Flush with the bottom edge, so the bar occupies exactly its own height and no more.
  '--umbradesktop-taskbar-reserve': `${U4_TASKBAR_HEIGHT}px`,
  '--umbradesktop-taskbar-margin': '0',
  '--umbradesktop-taskbar-radius': '0',
  '--umbradesktop-taskbar-background': U4_BAR,
  '--umbradesktop-taskbar-background-opaque': '#ebe8e2',
  // 2009 browsers had no backdrop filter, and a v4 toolbar was opaque regardless.
  '--umbradesktop-taskbar-backdrop': 'none',
  '--umbradesktop-taskbar-border-top': '1px solid #a5a096',
  '--umbradesktop-taskbar-shadow': '0 -2px 6px rgba(30, 40, 55, 0.12)',
  '--umbradesktop-taskbar-text': U4_TEXT,
  '--umbradesktop-taskbar-text-emphasis': U4_TEXT,
  // The bar's buttons already carry a raised edge, so hover lightens the fill rather than adding
  // one — the press is where this theme puts its emphasis, and that is in `taskbar.css.ts`.
  '--umbradesktop-task-hover-background': `linear-gradient(180deg, ${U4_WELL} 0%, #efede8 100%)`,
  '--umbradesktop-start-hover-background': `linear-gradient(180deg, ${U4_WELL} 0%, #efede8 100%)`,
  '--umbradesktop-start-active-background': U4_PRESSED,
  '--umbradesktop-launcher-width': `${U4_LAUNCHER_WIDTH}px`,
  // Hard against the left edge, directly above the bar — where v4 put its Sections panel, and
  // the reason this theme needs no repositioning at all.
  '--umbradesktop-launcher-left': '0',
  '--umbradesktop-launcher-max-height': `calc(100vh - ${U4_TASKBAR_HEIGHT + U4_LAUNCHER_TOP_CLEARANCE}px)`,
  '--umbradesktop-launcher-background': U4_PANEL,
  '--umbradesktop-launcher-backdrop': 'none',
  '--umbradesktop-launcher-border': `1px solid ${U4_EDGE_STRONG}`,
  '--umbradesktop-launcher-radius': '3px',
  '--umbradesktop-launcher-shadow': '0 8px 24px rgba(25, 35, 50, 0.34)',
  '--umbradesktop-launcher-text': U4_TEXT,
  '--umbradesktop-launcher-hover-background': U4_SELECT,
  '--umbradesktop-launcher-search-radius': '0',
  '--umbradesktop-launcher-card-background': U4_PANEL,
  '--umbradesktop-launcher-card-border': `1px solid ${U4_LINE_SOFT}`,
  '--umbradesktop-launcher-card-radius': '0',
  '--umbradesktop-launcher-border-emphasis': U4_SELECT_LINE,
  '--umbradesktop-launcher-pin-hover-background': U4_FACE,
  '--umbradesktop-desktop-background-color': U4_DESKTOP,
  '--umbradesktop-desktop-background-image': U4_DESKTOP_IMAGE,
  // No scrim: the wallpaper here is a flat gradient rather than a photograph, and the chrome is
  // opaque enough to read against it without dimming anything.
  '--umbradesktop-desktop-scrim': 'transparent',
  '--umbradesktop-desktop-watermark-opacity': '0.09',
};
