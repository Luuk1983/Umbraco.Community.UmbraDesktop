/**
 * The Umbraco logo, as the path data from Umbraco's own `icon-umbraco`.
 *
 * A copy rather than an import, because at runtime the backoffice exposes its public entry points
 * and not its individual icon files, so this bundle cannot reach the original. `umbraco-logo.test.ts`
 * compares the copy to the installed icon, so an Umbraco upgrade that redraws the mark fails a test
 * rather than leaving this one behind.
 *
 * It replaces a homemade drawing, a rounded U stroke on a disc, which System Information and Flying
 * Umbraco both used and which did not look like the logo. The real mark is a disc with the U cut out
 * of it, so the U is whatever is behind the disc: each caller decides what that is.
 */

/** The coordinate box {@link UMBRACO_LOGO_PATH} is drawn in, as in Umbraco's SVG. */
export const UMBRACO_LOGO_VIEWBOX = '0 0 315.89 315.89';

/** The logo's edge in the units of {@link UMBRACO_LOGO_VIEWBOX}, for scaling it onto a canvas. */
export const UMBRACO_LOGO_SIZE = 315.89;

/** The Umbraco blue the logo is filled with. */
export const UMBRACO_BLUE = '#3544b1';

/** The mark itself: a disc with the U knocked out of it. */
export const UMBRACO_LOGO_PATH =
  'M0 157.74a157.95 157.95 0 1 1 158 158.15A157.95 157.95 0 0 1 0 157.74m154.74 54.09a155.4 155.4 0 0 1-36.5-3.29 27.92 27.92 0 0 1-19.94-16q-5.35-12.34-5.21-38.1a243 243 0 0 1 1.69-26.84q1.55-13 3.09-21.46l1.07-5.59a2 2 0 0 0 0-.49 3.2 3.2 0 0 0-2.65-3.17l-20.37-3.22h-.44a3.19 3.19 0 0 0-3.11 2.48c-.35 1.31-.56 2.27-1.17 5.38-1.16 6-2.24 11.85-3.43 20.38a264 264 0 0 0-2.3 27.94 145 145 0 0 0 0 19.57q.72 25.94 8.9 41.42t27.72 22.3q19.53 6.81 54.43 6.66h2.91q34.94.15 54.41-6.66t27.71-22.3q8.17-15.53 8.91-41.42a145 145 0 0 0 0-19.57 267 267 0 0 0-2.3-27.94c-1.2-8.44-2.27-14.26-3.44-20.38-.61-3.11-.81-4.07-1.16-5.38a3.21 3.21 0 0 0-3.12-2.48h-.52l-20.38 3.18a3.2 3.2 0 0 0-2.68 3.17 4 4 0 0 0 0 .49l1.08 5.59q1.55 8.48 3.12 21.46a246 246 0 0 1 1.65 26.84q.27 25.69-5.21 38.07a27.9 27.9 0 0 1-19.76 16.07 155.2 155.2 0 0 1-36.48 3.29Z';
