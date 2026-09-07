/**
 * Every number Minesweeper needs in more than one place.
 *
 * This file exists because of the repository's "derive numbers, never type them" rule, and a game
 * is where that rule earns its keep: a cell's size is a `px` in the stylesheet, a multiplier in the
 * window size the manifest asks for, and a divisor in nothing at all — three readers, one truth. A
 * board that is 9 cells wide in the rules and 8 cells wide in the CSS is a bug no test would catch,
 * because both halves would agree with themselves.
 *
 * It is deliberately separate from both `rules.ts` and `minesweeper.element.ts`. The rules must not
 * know about pixels, and the manifest in `bundle.manifests.ts` must not import the element module:
 * that module is behind a lazy `element: () => import(...)` loader, and an eager import from the
 * manifest file would pull the whole game into the bundle's main chunk and undo the laziness. A
 * third module both can read costs one file and keeps both properties.
 */

import type { MinesweeperConfig } from './rules.js';

/**
 * The classic beginner board: 9 by 9 with 10 mines.
 *
 * Beginner rather than intermediate because the window has to be usable at `meta.minSize`, and the
 * desktop lets a user drag a window down to exactly that. A 16 by 16 board at a legible cell size
 * asks for a window most of the way across a laptop screen, which is a poor default for something
 * launched from a taskbar.
 */
export const MINESWEEPER_BEGINNER: MinesweeperConfig = { width: 9, height: 9, mineCount: 10 };

/**
 * One cell's edge in px.
 *
 * 26 is the smallest size at which a single digit stays legible in the theme UI fonts *and* the
 * cell stays a comfortable pointer target: the WCAG 2.5.8 minimum for a target is 24, and a cell
 * has to survive being clicked eighty-one times without a misfire.
 */
export const MINESWEEPER_CELL_SIZE_PX = 26;

/** Padding inside the sunken well that holds the grid, in px. Also the app's own outer padding. */
export const MINESWEEPER_PADDING_PX = 8;

/**
 * The gap between cells, in px, which is also how the grid gets its ruling.
 *
 * The grid's ground is `--umbradesktop-app-border` and shows through this gap, because a tiled grid
 * needs a boundary between neighbours and `--umbradesktop-app-edge-width` cannot give it one: two
 * of the five themes publish `0px` there, correctly, since their own controls are flat. See the
 * `.grid` rule in `minesweeper.element.ts` for the whole of that reasoning. It is counted into
 * {@link MINESWEEPER_CONTENT_SIZE} because eight of them across a nine-cell board is eight pixels
 * the content box has to hold.
 *
 * **Every theme gets it**, including Windows 98, and that is load-bearing rather than uniformity
 * for its own sake. This gap is a term in the size the manifest declares, one number for all five
 * themes, so a theme that zeroed it made the board eight pixels smaller than the window the host
 * had opened for it and left a dead band inside the frame — which is what was reported, on the one
 * theme whose branch used to say `gap: 0`. The branch now paints the gap in the face colour instead
 * of removing it, so the sum stays true and Windows 98 still reads as butted bevels.
 */
export const MINESWEEPER_GRID_GAP_PX = 1;

/** Height of the status row (mine counter, new game, clock) in px. */
export const MINESWEEPER_STATUS_HEIGHT_PX = 34;

/**
 * Height of the outcome line under the board, in px.
 *
 * Not a term in {@link MINESWEEPER_CONTENT_SIZE}, which is the point: the line is drawn as a
 * banner over the board rather than in a row of its own, so it costs no layout and the window does
 * not carry 32px of empty space around for the whole game waiting for something to say. It used to
 * be a row, and that row plus its margin was most of the "too much space by default" that was
 * reported against the tightest of the five frames.
 *
 * 24 is one line at the 1.4 line-height this app uses, sized for the largest body font a theme is
 * likely to set, and rounded up to an even number so the line centres on whole pixels — which
 * Windows 98 cares about and no other theme minds.
 */
export const MINESWEEPER_OUTCOME_HEIGHT_PX = 24;

/**
 * The **content** box Minesweeper asks the host for: the status row, the board in its well, the
 * outcome line, and this app's own padding. Nothing else.
 *
 * Nothing else is the whole point. `meta.defaultSize` and `meta.minSize` are an app's content size
 * and the host adds its own chrome, so there is no titlebar term here and there must not be: each
 * of the five themes draws its own caption, one of them draws a frame ring below the body as well
 * as above it, and none of that is readable from another package. This file used to carry a
 * `TITLEBAR_ALLOWANCE_PX` of 44 ("the tallest of the five") and an `EDGE_SLACK_PX` of 8 for the
 * bevels, and both were guesses at numbers the host knows exactly: the first came out 32px short
 * under Windows 98, whose bottom bevel it never counted, and the second is not needed at all now
 * that the well's edge is a spread shadow rather than a border (see `.well` in
 * `minesweeper.element.ts`) and therefore costs no layout.
 *
 * Every term left is this app's own: nine cells and eight gaps across, the well's padding and this
 * element's padding on both sides (four paddings), and vertically the status row, the board and the
 * five paddings between and around them — this element's top and bottom, the well's top and bottom,
 * and the one between the status row and the well.
 *
 * No term for the outcome line. It is a banner over the board rather than a row under it, for the
 * reason {@link MINESWEEPER_OUTCOME_HEIGHT_PX} gives: a row that says nothing for the whole game
 * still takes its height out of every window the app is ever opened in.
 */
export const MINESWEEPER_CONTENT_SIZE = {
  w:
    MINESWEEPER_BEGINNER.width * MINESWEEPER_CELL_SIZE_PX +
    (MINESWEEPER_BEGINNER.width - 1) * MINESWEEPER_GRID_GAP_PX +
    MINESWEEPER_PADDING_PX * 4,
  h:
    MINESWEEPER_BEGINNER.height * MINESWEEPER_CELL_SIZE_PX +
    (MINESWEEPER_BEGINNER.height - 1) * MINESWEEPER_GRID_GAP_PX +
    MINESWEEPER_STATUS_HEIGHT_PX +
    MINESWEEPER_PADDING_PX * 5,
} as const;

/**
 * The smallest content box the user may drag the window down to.
 *
 * The same size as {@link MINESWEEPER_CONTENT_SIZE}, and that is the point rather than laziness: a
 * 9 by 9 grid does not reflow, so any box smaller than the board either clips cells or shrinks them
 * below the target size {@link MINESWEEPER_CELL_SIZE_PX} was chosen for. The guide's checklist asks
 * whether the app is usable at `minSize`; the honest answer for a fixed grid is to make `minSize`
 * the size that is usable.
 *
 * Being a content size also takes the desktop's own affordances out of this app's hands: the host
 * floors whatever is declared here at what its chrome needs, so the 282px this used to work out to
 * can no longer push a window control off the end of a titlebar.
 */
export const MINESWEEPER_MIN_CONTENT_SIZE = MINESWEEPER_CONTENT_SIZE;

/**
 * How many digits the mine counter and the clock render, and so how far the clock counts before it
 * stops. Three, as on the original: `999` seconds is over sixteen minutes of a beginner board.
 */
export const MINESWEEPER_DISPLAY_DIGITS = 3;
