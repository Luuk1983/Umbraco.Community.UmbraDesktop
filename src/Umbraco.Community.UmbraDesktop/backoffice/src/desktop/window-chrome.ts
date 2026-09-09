import type { UmbraDesktopThemeMetrics } from './theme/types';

/**
 * The arithmetic between an app's **content** size and the **window** size that holds it.
 *
 * It lives in the host because the host is the only party that can do it. An app declares how big
 * its own box needs to be; what a titlebar, a frame ring or a sunken well costs on top of that is
 * the active theme's business, differs by theme, and is not readable from another package — the
 * first consumer of the app contract guessed a "tallest of the five" titlebar allowance plus a
 * slack term for the bevels, and both guesses were wrong for Windows 98, which spends a ring at the
 * top *and* the bottom. So the app states what it needs and this module adds the chrome, from the
 * numbers the active theme already publishes.
 *
 * Pure functions over `metrics` rather than methods on the window manager, because two callers need
 * them at two different moments: the manager sizes a window as it opens, and the window element
 * writes the resize floor into its own inline style on every render.
 */

/** A width/height pair in px. Both a content size and a window size are one of these. */
export interface UmbraDesktopSize {
  /** Width in px. */
  w: number;
  /** Height in px. */
  h: number;
}

/**
 * The window size that gives an app the content box it asked for.
 *
 * `metrics.chromeWidth` and `metrics.chromeHeight` are what the active theme's chrome takes out of
 * a window's declared size before anything reaches the app, measured in the same reference frame
 * the size is written in (see their own docs on {@link UmbraDesktopThemeMetrics}), so this is a
 * plain sum and deliberately nothing cleverer.
 * @param content The content box the app asked for.
 * @param metrics The active theme's geometry.
 * @param extraHeight What this window's own strip costs on top of the theme's fixed chrome:
 * `metrics.pathbarHeight` for a window that draws a path strip, zero for one that does not. Explicit
 * rather than defaulted, because a caller that forgets it is a window whose app is silently that
 * many pixels shorter than it asked for, and a default would hide exactly that.
 * @returns The window size to open at.
 */
export function windowSizeForContent(
  content: UmbraDesktopSize,
  metrics: UmbraDesktopThemeMetrics,
  extraHeight: number,
): UmbraDesktopSize {
  return { w: content.w + metrics.chromeWidth, h: content.h + metrics.chromeHeight + extraHeight };
}

/**
 * The smallest window this theme's own chrome can be drawn in, whatever the app inside it wants.
 *
 * A floor rather than a preference: an app is allowed to ask for a small content box, and it is not
 * allowed to take one of the desktop's affordances away doing it. The reported failure is exactly
 * that — a game whose honestly derived minimum was 282px wide pushed the close button off the
 * titlebar's trailing end, because the window element writes the app's minimum straight into an
 * inline `min-width` that beats the chrome's own. "A theme may restyle, never remove" read from a
 * direction nobody had tested: it was an *app* doing the removing.
 *
 * Width is the two control strips plus a graspable strip of caption, which is the same
 * `leading + trailing + grab` budget `clampWindowPosition` keeps on screen while dragging: below it
 * either a control is off the window or there is no caption left to grab it by. Those three are
 * measured from the window's outer edges, which for a theme whose frame sizes content-box is a
 * border ring wider than the box this floor applies to, so the floor errs a pixel or two on the
 * generous side — never the clipping one.
 *
 * Height is the chrome's own height: a window may be squashed until its body is nothing, and no
 * further, because the titlebar is the only handle it has.
 * @param metrics The active theme's geometry.
 * @returns The smallest window size the chrome stays whole in.
 */
export function chromeMinWindowSize(metrics: UmbraDesktopThemeMetrics): UmbraDesktopSize {
  return {
    w: metrics.leadingControlsWidth + metrics.trailingControlsWidth + metrics.grab,
    h: metrics.chromeHeight,
  };
}

/**
 * The resize floor for a window: the app's content minimum plus the chrome, never below what the
 * chrome itself needs.
 *
 * A `max` of the two and not a choice between them, which is the part that is easy to write the
 * wrong way round: an app that needs more than the chrome does gets what it needs, and an app that
 * needs less still cannot shrink the chrome past {@link chromeMinWindowSize}.
 * @param contentMin The smallest content box the app can work in, or undefined for an app that
 * named none.
 * @param fallback The content minimum to use for an app that named none.
 * @param metrics The active theme's geometry.
 * @param extraHeight What this window's own strip costs, as on {@link windowSizeForContent}. It is
 * added to *both* sides of the `max`, deliberately: a window squashed to the chrome's own floor must
 * still be able to draw its strip, and an affordance that disappears when a window gets small is a
 * bug rather than a style.
 * @returns The smallest window size the user may drag to.
 */
export function minWindowSizeForContent(
  contentMin: UmbraDesktopSize | undefined,
  fallback: UmbraDesktopSize,
  metrics: UmbraDesktopThemeMetrics,
  extraHeight: number,
): UmbraDesktopSize {
  const content = windowSizeForContent(contentMin ?? fallback, metrics, extraHeight);
  const chrome = chromeMinWindowSize(metrics);
  return { w: Math.max(content.w, chrome.w), h: Math.max(content.h, chrome.h + extraHeight) };
}
