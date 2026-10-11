import type { UmbraDesktopPalette } from '../../types';
import { UMBRADESKTOP_TITLEBAR_BORDER, UMBRADESKTOP_WINDOW_BORDER } from '../../../constants.js';
import { UMBRACO_CONTROL_FACE, UMBRACO_TASK_GROUP_RADIUS, UMBRACO_WINDOW_RADIUS } from './metrics.js';

/**
 * The backoffice's own header colour, which a focused window's caption wears and the shadows are
 * tinted with. A reference, not a hex: it is the navy by default, and it is whatever a site has set
 * its backoffice colours to otherwise, so the desktop's chrome follows the site's brand the way the
 * backoffice header does.
 */
const HEADER = 'var(--uui-color-header-surface)';

/** The text colour on that header, at full strength. White by default, whatever reads on a custom one. */
const HEADER_INK = 'var(--uui-color-header-contrast-emphasis)';

/**
 * A colour at a percentage of its strength, over whatever is behind it.
 *
 * `color-mix` against `transparent` rather than a hand-written `rgba`, because every value this
 * palette tints is a `var()` reference, and an alpha cannot be written onto one. It is also what
 * keeps the shadows and hairlines correct when the header colour is not the shipped navy.
 * @param colour The colour to thin out.
 * @param percent How much of it to keep.
 * @returns A `color-mix` value.
 */
export const umbracoTint = (colour: string, percent: number): string =>
  `color-mix(in srgb, ${colour} ${percent}%, transparent)`;

/**
 * A circle of one colour, centred in the box it is the background of and the width of the painted
 * caption-button face.
 *
 * This is how the caption's buttons get a round hover without adding any structure to the window:
 * the base paints a button's hover with a `background` shorthand fed by a token, and a gradient is
 * a valid value for one. The edge is a one-pixel ramp rather than a hard stop, which is what keeps
 * it from stair-stepping on a low-density screen.
 * @param colour The fill.
 * @returns A `radial-gradient` value.
 */
export const umbracoFace = (colour: string): string => {
  const radius = UMBRACO_CONTROL_FACE / 2;
  return `radial-gradient(circle ${radius}px at 50% 50%, ${colour} ${radius - 1}px, transparent ${radius}px)`;
};

/**
 * Umbraco's danger, lightened to read on the navy header. Its `danger-standalone` is a dark maroon,
 * darkened to read on a white ground, which sank to about 2:1 on the navy. Used for the error marker
 * and for a failed progress ring in a focused caption, and nowhere else: the notice banner under the
 * caption is pale pink and keeps the dark one.
 */
export const UMBRACO_LIGHT_DANGER = 'color-mix(in srgb, var(--uui-color-danger) 55%, white)';

/**
 * The Umbraco theme: the backoffice's own header worn by the focused window, round caption
 * buttons, a corner as round as the cards inside, and a shadow tinted with the brand.
 *
 * **It sets only chrome tokens, never an app token.** An app's fallback is the Umbraco look and
 * lives in the app (`UMBRADESKTOP_APP_TOKEN_FALLBACKS`), so answering one here would fork the two.
 * `app-tokens.test.ts` holds that.
 *
 * **Every value is a `--uui-*` reference**, which is what lets one palette serve the backoffice's
 * light, dark and high-contrast settings and a site's own colours, and is why there is no dark
 * variant. The same reason the old, empty palette could follow them: the values come from the
 * backoffice rather than from this file.
 *
 * What a palette cannot say is in `window.css.ts` and `taskbar.css.ts`: the unfocused window's
 * sand caption, the Regular title, the hover tile on a taskbar button.
 */
export const UMBRACO_PALETTE: UmbraDesktopPalette = {
  '--umbradesktop-window-radius': `${UMBRACO_WINDOW_RADIUS}px`,
  // The snap ghost stands in for the window that is about to be there, so it takes the same corner.
  '--umbradesktop-snap-ghost-radius': `${UMBRACO_WINDOW_RADIUS}px`,
  // Widths are the base's own constants, restated: they are in `metrics`, and a palette that
  // changed one would move where a dragged window stops.
  '--umbradesktop-window-border': `${UMBRADESKTOP_WINDOW_BORDER}px solid ${umbracoTint(HEADER, 30)}`,
  // Tinted with the brand rather than black, and one soft layer plus a hairline of contact. The
  // shadows these replace were Material's 2014 pair, whose second layer is tight and dark and draws
  // a smudge along the window's edge: the main reason the frame felt heavy.
  '--umbradesktop-window-shadow': `0 6px 18px -4px ${umbracoTint(HEADER, 20)}, 0 1px 3px ${umbracoTint(HEADER, 14)}`,
  '--umbradesktop-window-shadow-active': `0 28px 60px -10px ${umbracoTint(HEADER, 46)}, 0 4px 14px ${umbracoTint(HEADER, 18)}`,
  // The focused caption. The unfocused one is in the sheet, because it needs a different value of
  // each of these and a palette has one.
  '--umbradesktop-titlebar-background': HEADER,
  // Navy under navy, so the hairline the caption's box carries is invisible on a focused window and
  // the caption's height is still what `metrics` says it is.
  '--umbradesktop-titlebar-border-bottom': `${UMBRADESKTOP_TITLEBAR_BORDER}px solid ${HEADER}`,
  '--umbradesktop-titlebar-text': HEADER_INK,
  // Colour, not opacity, does the quieting of an unfocused window here: the base fades title and
  // buttons together, and a white title faded on a sand caption is simply gone.
  '--umbradesktop-titlebar-inactive-opacity': '1',
  '--umbradesktop-control-color': HEADER_INK,
  '--umbradesktop-control-hover-background': umbracoFace(umbracoTint(HEADER_INK, 16)),
  // Solid danger on the navy bar, with a white glyph. The sheet turns it into a pale wash with a
  // danger glyph on an unfocused caption, where a solid red disc would be the loudest thing on screen.
  '--umbradesktop-control-close-hover-background': umbracoFace('var(--uui-color-danger)'),
  '--umbradesktop-control-close-hover-color': 'var(--uui-color-danger-contrast)',
  // The progress ring in a focused caption. The base draws it in a mid blue written against a white
  // caption, and on the navy that is blue on navy. The coral the taskbar's ring uses reads on it, the
  // track is the title's own ink faint, and a failure is the same lightened danger as the error marker.
  '--umbradesktop-titlebar-progress-fill': 'var(--uui-color-current)',
  '--umbradesktop-titlebar-progress-track': umbracoTint(HEADER_INK, 24),
  '--umbradesktop-titlebar-progress-failed': UMBRACO_LIGHT_DANGER,
  // The taskbar's hover is a tile painted in the sheet, so the button's own fill is switched off.
  // Transparent rather than unset: unset falls back to the base's full-height white wash.
  '--umbradesktop-task-hover-background': 'transparent',
  '--umbradesktop-start-hover-background': 'transparent',
  '--umbradesktop-start-active-background': 'transparent',
  // A box for windows that belong together, drawn as a tab rising from the bar's edge: rounded
  // above and open below, so the focused window's line inside it stays on the bar's own edge like
  // every other window's.
  '--umbradesktop-task-group-radius': `${UMBRACO_TASK_GROUP_RADIUS}px ${UMBRACO_TASK_GROUP_RADIUS}px 0 0`,
  '--umbradesktop-task-group-padding': '0 3px',
  '--umbradesktop-task-group-gap': '0',
  '--umbradesktop-task-group-border': `1px solid ${umbracoTint('currentColor', 22)}`,
  '--umbradesktop-task-group-background': umbracoTint('currentColor', 7),
};
