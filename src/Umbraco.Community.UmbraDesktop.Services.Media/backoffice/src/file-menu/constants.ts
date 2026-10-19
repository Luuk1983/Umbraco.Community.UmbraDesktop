/**
 * Every number the file menu needs in more than one place: its stylesheet, its tests, and the
 * developer page that tells an app how big a box to give it. Separate from the element so a test
 * reads them without rendering anything.
 */

/** The file menu's tag, which an app in another package uses by name. Published. */
export const FILE_MENU_TAG = 'umbradesktop-media-file-menu';

/** The open view's tag: Open on its own, for an app's empty canvas (design D14). Published. */
export const OPEN_VIEW_TAG = 'umbradesktop-media-open-view';

/** Width of the menu itself, in px: the mock's 380, wide enough for a command, its line and its key. */
export const MENU_WIDTH = 380;

/**
 * Width of each panel that slides in over the menu, in px, as the mock drew them on a 1480px window.
 * Every one is capped at the app's own width, so a small window gets a whole panel rather than a cut
 * one. Save as is the widest because it shows the picture beside its form.
 */
export const PANEL_WIDTHS = { open: 760, saveAs: 940, info: 460 } as const;

/** Height of a menu's or a panel's header and of its footer, in px: Umbraco's side panel's bars. */
export const SHEET_BAR_HEIGHT = 64;

/**
 * Height of one command in the menu, in px: its label and the line under it, and more than the 48px
 * Material and Apple both ask a touch target to be at least.
 */
export const COMMAND_HEIGHT = 64;

/** Padding round a menu's or a panel's content, in px. */
export const PAGE_PADDING = 24;

/**
 * Width of Save as's form column, in px: its widest row is the four format choices side by side,
 * each wide enough for "Keep (JPEG)" and "WebP" in a large target. The preview takes what is left.
 */
export const SAVE_AS_FORM_WIDTH = 360;

/** The narrowest Save as preview still worth drawing beside the form, in px. */
export const SAVE_AS_PREVIEW_MIN_WIDTH = 96;

/** Gap between Save as's form and its preview, and between a panel's blocks, in px. */
export const PAGE_GAP = 16;

/**
 * Height of Save as's content at its tallest, in px: a copy, with its name and folder rows, at the
 * narrowest width. The one number here that is measured rather than summed, since the form's rows
 * wrap their own text and so their sum is the browser's. Measured 2026-10-18 in Chrome at 366px for a
 * copy and 314px for a replace with the address warning, under every theme id; `fits.test.ts` fails
 * if it grows.
 */
export const SAVE_AS_CONTENT_HEIGHT = 366;

/**
 * The smallest box an app may give the file menu, published on the developer page: the box it
 * covers, since the menu and its panels slide in over all of it. Wide enough for Save as's form and a
 * preview beside it, tall enough for Save as's tallest form between the panel's header and footer.
 * Held against the rendered panel under every theme by `fits.test.ts`, because deriving only makes
 * the sum agree with itself.
 */
export const FILE_MENU_MIN_SIZE = {
  w: PAGE_PADDING * 2 + SAVE_AS_FORM_WIDTH + PAGE_GAP + SAVE_AS_PREVIEW_MIN_WIDTH,
  h: SHEET_BAR_HEIGHT * 2 + PAGE_PADDING * 2 + SAVE_AS_CONTENT_HEIGHT,
} as const;

/** How long Save as waits after the last change of format or quality before it measures the size. */
export const MEASURE_DEBOUNCE_MS = 300;

/** How long the menu and a panel take to slide in, in ms. None under `prefers-reduced-motion`. */
export const SLIDE_MS = 180;

/** The events the file menu and the open view fire, by name, so an app listening and the element agree. */
export const FILE_MENU_EVENTS = {
  open: 'umbradesktop-media-file-open',
  saved: 'umbradesktop-media-file-saved',
  failed: 'umbradesktop-media-file-failed',
  hidden: 'umbradesktop-media-file-hidden',
  close: 'umbradesktop-media-file-close',
} as const;
