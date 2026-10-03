/**
 * How long the greeting holds before the language page follows by itself, in milliseconds
 * (design doc D12). Long enough for the ring to close and both lines to be read; a click or any key
 * goes on sooner.
 *
 * 2.5 seconds at first, with one word. In use that went by before it registered as a first visit
 * rather than a loading screen, so the greeting now names the desktop and says what follows, and
 * holds long enough to read it.
 */
export const UMBRADESKTOP_WELCOME_HOLD_MS = 5000;

/**
 * How long the arc takes to close into a full ring at the start of the greeting, in milliseconds.
 * The name fades in as it finishes, and the line under it after that.
 */
export const UMBRADESKTOP_WELCOME_CLOSE_MS = 1200;

/** How long the wizard takes to fade off the desktop after Done, in milliseconds. */
export const UMBRADESKTOP_WELCOME_FADE_MS = 400;

/**
 * Scale of the theme page's miniatures against the preview scene.
 *
 * Smaller than the picker's, because the picker stacks five rows in a tall panel and the wizard
 * lays five side by side: at this scale they fit across a 1024px screen with room either side.
 */
export const UMBRADESKTOP_WELCOME_PREVIEW_SCALE = 0.175;
