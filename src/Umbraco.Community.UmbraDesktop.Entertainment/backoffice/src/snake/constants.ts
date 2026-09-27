/**
 * Every number Snake needs in more than one place.
 *
 * Separate from both `rules.ts` and `snake.element.ts` for the reason Minesweeper's `constants.ts`
 * gives: the rules must not know about pixels or milliseconds, and the manifest must not import the
 * element module, because that module sits behind a lazy `element: () => import(...)` loader and an
 * eager import from the manifest would pull the whole game into the bundle's main chunk.
 */

import type { SnakeConfig } from './rules.js';

/**
 * The board: 20 by 20, starting three long.
 *
 * Twenty is roomy enough that the first dozen pieces of food are about steering rather than about
 * the body, and small enough that the window it needs sits comfortably on a laptop screen beside
 * the backoffice windows it is a break from.
 */
export const SNAKE_BOARD: SnakeConfig = { width: 20, height: 20, initialLength: 3 };

/**
 * One cell's edge in px.
 *
 * Smaller than Minesweeper's 26 because nothing here is a click target and nothing holds a digit: a
 * cell only has to be big enough to see which way the snake is going.
 */
export const SNAKE_CELL_SIZE_PX = 14;

/** Padding inside the well that holds the board, in px. Also the app's own outer padding. */
export const SNAKE_PADDING_PX = 8;

/** Height of the status row (score, new game, best) in px. */
export const SNAKE_STATUS_HEIGHT_PX = 34;

/** Points scored for each piece of food eaten. */
export const SNAKE_POINTS_PER_FOOD = 10;

/** Milliseconds per move at the start of a game. */
export const SNAKE_START_TICK_MS = 150;

/** Milliseconds per move at full speed, which the game reaches after enough food and never passes. */
export const SNAKE_MIN_TICK_MS = 60;

/** How much faster each piece of food makes the snake, in ms per move. */
export const SNAKE_TICK_STEP_MS = 3;

/**
 * How long one move takes, given how much the snake has eaten.
 *
 * Speeding up is what gives Snake a difficulty curve at all. The board only gets harder as the body
 * grows, and a long snake at the opening speed is a test of patience rather than of reflexes. The
 * floor stops it becoming unplayable: 60ms is about the fastest a player can still read a turn.
 * @param eaten Pieces of food eaten so far.
 * @returns The delay before the next move, in ms.
 */
export function snakeTickInterval(eaten: number): number {
  return Math.max(SNAKE_MIN_TICK_MS, SNAKE_START_TICK_MS - eaten * SNAKE_TICK_STEP_MS);
}

/**
 * The **content** box Snake asks the host for: the status row, the board in its well, and this app's
 * own padding. The host adds its own chrome, so there is no titlebar term here. See
 * `MINESWEEPER_CONTENT_SIZE` for the full reasoning, all of which applies.
 *
 * Across: the board, the well's padding and this element's padding on both sides (four paddings).
 * Down: the status row, the board, and five paddings: this element's top and bottom, the well's top
 * and bottom, and the one between the status row and the well. The pause and game-over message is
 * a banner over the board and costs no layout.
 */
export const SNAKE_CONTENT_SIZE = {
  w: SNAKE_BOARD.width * SNAKE_CELL_SIZE_PX + SNAKE_PADDING_PX * 4,
  h: SNAKE_BOARD.height * SNAKE_CELL_SIZE_PX + SNAKE_STATUS_HEIGHT_PX + SNAKE_PADDING_PX * 5,
} as const;

/** The smallest content box the window may be dragged to: the whole board, since a grid does not reflow. */
export const SNAKE_MIN_CONTENT_SIZE = SNAKE_CONTENT_SIZE;
