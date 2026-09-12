/**
 * The geometry of a theme preview, in one place because CSS and the tests both need it.
 *
 * The miniature is drawn at **desktop scale** and shrunk with a transform, rather than drawn small.
 * That is the whole trick: a theme's tokens are real pixel values — a 40px titlebar, a 16px dock
 * radius, a 3px window ring — and a miniature drawn in its own made-up units would have to invent a
 * conversion for each of them and would stop tracking the theme the moment one changed. Scaled, a
 * theme paints the preview with exactly the numbers it paints the desktop with.
 */

/**
 * The scene's size in desktop pixels. Roughly a small laptop, so the taskbar takes the share of the
 * height it takes in use rather than the third of it a 360px-tall scene would give it.
 */
export const UMBRADESKTOP_PREVIEW_SCENE = { w: 960, h: 600 } as const;

/**
 * How far the scene is shrunk. Chosen against the panel it renders in: at 0.15 a preview is 144 by
 * 90, which is two to a row in the `small` settings sidebar and five themes over three rows.
 *
 * A third per row would need roughly 125px, which is reachable, and it is not worth it. The whole
 * point of this change is that a preview is legible where three colour bars were not, and the
 * sidebar has vertical room to spare once settings are behind categories (see #57). Legibility
 * beats a tidier grid here.
 */
export const UMBRADESKTOP_PREVIEW_SCALE = 0.15;

/**
 * The scale the theme picker draws at, where {@link UMBRADESKTOP_PREVIEW_SCALE} is the scale the
 * settings panel's "this is your theme" preview draws at.
 *
 * Bigger because the picker gives a preview a row to itself rather than a spot in a grid: at 0.2 a
 * preview is 192 by 120, which leaves room beside it in a `small` sidebar for the theme's name and
 * a line about it. Applied as `--umbradesktop-preview-scale` on the element, so the size lives here
 * rather than in two stylesheets.
 */
export const UMBRADESKTOP_PREVIEW_PICKER_SCALE = 0.2;

/**
 * Where the one window sits in the scene, in desktop pixels. Placed off-centre, with more room
 * below than above, so the taskbar has space to be a floating dock on the themes that make it one
 * without the window appearing to rest on it.
 */
export const UMBRADESKTOP_PREVIEW_WINDOW = { x: 130, y: 96, w: 620, h: 380 } as const;

/**
 * How many control glyphs a titlebar draws, at whichever end the theme's metrics put them.
 *
 * Three rather than the four the Umbraco window actually has: minimise, maximise and close is what
 * every one of these themes reduces to at 15% scale, and a fourth dot at 2px reads as a smudge
 * rather than as a button. The *width* of the block is the theme's own number and is what the eye
 * is actually sorting on — a macOS titlebar's controls are on the left and nothing else's are.
 */
export const UMBRADESKTOP_PREVIEW_CONTROL_COUNT = 3;
