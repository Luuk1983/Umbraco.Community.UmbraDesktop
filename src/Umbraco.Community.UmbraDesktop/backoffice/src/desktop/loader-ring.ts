/**
 * The Umbraco mark with a turning arc around it: one shape, drawn at two sizes.
 *
 * It started as the boot splash's own markup and is shared from here because a second copy would
 * have meant a second set of numbers. The splash's literals said "a quarter of the circumference,
 * near enough", which is fine once and drifts the moment a smaller version is typed beside it — the
 * failure being two animations that are *almost* the same, which reads as sloppiness rather than as
 * a bug and so never gets filed.
 *
 * Everything here is either a ratio or a derivation from one. The one thing that genuinely differs
 * between the two sizes is stroke weight, and {@link ringStrokeWidth} is where that is dealt with
 * rather than by hand at each call site. See `loader-ring.test.ts`, which pins the splash's shipped
 * numbers so this module cannot quietly rescale the boot screen.
 *
 * Deliberately free of imports. `boot/splash.ts` is the earliest code this package runs, before the
 * custom element registry or any Umbraco context can be relied on, and it can only keep depending
 * on nothing if what it depends on depends on nothing either.
 */

/**
 * The Umbraco mark's `viewBox`, as core's `icon-umbraco` carries it.
 *
 * Not a square, and not rounded to one: the path is drawn against these exact bounds, and trimming
 * the decimals shifts the mark off centre inside its own box by a fraction that is visible once the
 * ring is concentric with it.
 */
export const UMBRADESKTOP_MARK_VIEWBOX = '0 0 315.89 315.89';

/**
 * The mark itself, as a single path.
 *
 * Copied from core's `icon-umbraco` rather than resolved through `umb-icon`, which fetches the icon
 * dictionary, or `umb-app-logo`, which waits on `UMB_SERVER_CONTEXT` and then the management API.
 * A loading indicator that waits on a network request to say "loading" is a joke at the user's
 * expense, and on the splash it would not paint at all.
 *
 * Carries no `fill`, so both callers set it from their own colour and the mark follows whatever
 * the surrounding theme says — white on the splash's fixed dark ground, the theme's loader colour
 * in a window.
 */
export const UMBRADESKTOP_MARK_PATH =
  'M0 157.74a157.95 157.95 0 1 1 158 158.15A157.95 157.95 0 0 1 0 157.74m154.74 54.09a155.4 155.4 0 0 1-36.5-3.29 27.92 27.92 0 0 1-19.94-16q-5.35-12.34-5.21-38.1a243 243 0 0 1 1.69-26.84q1.55-13 3.09-21.46l1.07-5.59a2 2 0 0 0 0-.49 3.2 3.2 0 0 0-2.65-3.17l-20.37-3.22h-.44a3.19 3.19 0 0 0-3.11 2.48c-.35 1.31-.56 2.27-1.17 5.38-1.16 6-2.24 11.85-3.43 20.38a264 264 0 0 0-2.3 27.94 145 145 0 0 0 0 19.57q.72 25.94 8.9 41.42t27.72 22.3q19.53 6.81 54.43 6.66h2.91q34.94.15 54.41-6.66t27.71-22.3q8.17-15.53 8.91-41.42a145 145 0 0 0 0-19.57 267 267 0 0 0-2.3-27.94c-1.2-8.44-2.27-14.26-3.44-20.38-.61-3.11-.81-4.07-1.16-5.38a3.21 3.21 0 0 0-3.12-2.48h-.52l-20.38 3.18a3.2 3.2 0 0 0-2.68 3.17 4 4 0 0 0 0 .49l1.08 5.59q1.55 8.48 3.12 21.46a246 246 0 0 1 1.65 26.84q.27 25.69-5.21 38.07a27.9 27.9 0 0 1-19.76 16.07 155.2 155.2 0 0 1-36.48 3.29Z';

/**
 * Side of the ring's own `viewBox`, in user units.
 *
 * Doubles as the splash's rendered size, which is why the splash needs no stroke compensation: at
 * one user unit per pixel the two coordinate systems are the same. Every other size is a scale of
 * this one.
 */
export const UMBRADESKTOP_RING_VIEWBOX = 150;

/** Radius of both circles, in viewBox units. Leaves the mark room to sit inside the arc. */
export const UMBRADESKTOP_RING_RADIUS = 58;

/**
 * How thick the ring should *look*, in CSS pixels, at whatever size it is drawn.
 *
 * A hairline, and the same hairline at 64px as at 150px: scaling it with the box would make the
 * window loader's ring a grey suggestion rather than a line, and thickening it proportionally at
 * the small end would make it a hoop. {@link ringStrokeWidth} converts this into the user units the
 * SVG actually needs.
 */
export const UMBRADESKTOP_RING_STROKE_PX = 2;

/**
 * The mark's side at {@link UMBRADESKTOP_RING_VIEWBOX}, in pixels.
 *
 * 72 of 150, chosen by eye on the boot screen against the alternatives. Kept as the pair of whole
 * numbers rather than the 0.48 between them so {@link ringMarkSize} divides exactly and the splash
 * comes out at the integer it already ships.
 */
export const UMBRADESKTOP_MARK_SIZE_AT_VIEWBOX = 72;

/** How long the arc takes to come round. Read by both callers' keyframes. */
export const UMBRADESKTOP_RING_SPIN_MS = 1150;

/** Rendered side of the ring on the boot splash, in CSS pixels. */
export const UMBRADESKTOP_SPLASH_RING_SIZE = UMBRADESKTOP_RING_VIEWBOX;

/**
 * Rendered side of the ring in a loading window body, in CSS pixels.
 *
 * Less than half the splash's, because the splash owns a screen and this owns whatever is left of a
 * window someone may have dragged down to the minimum in `constants.ts`. Picked by looking
 * at 48, 64 and 88 in a window body: 48 reads as a busy cursor rather than a logo, 88 fills a
 * half-height window.
 */
export const UMBRADESKTOP_WINDOW_RING_SIZE = 64;

/** The ring's full circumference, in viewBox units. The number every arc length derives from. */
const RING_CIRCUMFERENCE = 2 * Math.PI * UMBRADESKTOP_RING_RADIUS;

/**
 * `stroke-dasharray` for the arc: a quarter of the ring visible, and a gap long enough that the
 * rest of it stays empty.
 *
 * A quarter because the two failure modes are either side of it — much less reads as a dot chasing
 * the logo, much more as a ring that is merely wobbling. The gap is the *whole* circumference
 * rather than a number chosen to clear the remainder, since any value past the remainder does the
 * same job and this one cannot stop being large enough if the radius changes.
 *
 * Needs no per-size compensation, unlike the stroke: a dash pattern is measured in user units, so
 * it scales with the circle it is drawn on and stays a quarter at any rendered size.
 */
export const UMBRADESKTOP_RING_DASHARRAY = `${(RING_CIRCUMFERENCE / 4).toFixed(3)} ${RING_CIRCUMFERENCE.toFixed(3)}`;

/**
 * The `stroke-width`, in viewBox units, that paints {@link UMBRADESKTOP_RING_STROKE_PX} at a given
 * rendered size.
 *
 * The SVG scales to its CSS box, so a stroke written in user units is divided by that scale on the
 * way to the screen. This multiplies it back. SVG's own `vector-effect: non-scaling-stroke` looks
 * like the built-in answer and is not: it strokes in device space, which takes the dash pattern
 * with it, and the arc stops being a quarter at any size but one.
 * @param renderedPx The side of the box the ring is drawn into, in CSS pixels.
 * @returns The stroke width to set on the circles, in viewBox units.
 */
export function ringStrokeWidth(renderedPx: number): number {
  return (UMBRADESKTOP_RING_STROKE_PX * UMBRADESKTOP_RING_VIEWBOX) / renderedPx;
}

/**
 * The mark's side, in CSS pixels, for a ring drawn at a given rendered size.
 *
 * A ratio rather than a second chosen number, so the window loader is the splash shrunk rather than
 * a similar composition that happens to sit beside it.
 * @param renderedPx The side of the box the ring is drawn into, in CSS pixels.
 * @returns The mark's side, in CSS pixels.
 */
export function ringMarkSize(renderedPx: number): number {
  return (renderedPx * UMBRADESKTOP_MARK_SIZE_AT_VIEWBOX) / UMBRADESKTOP_RING_VIEWBOX;
}
