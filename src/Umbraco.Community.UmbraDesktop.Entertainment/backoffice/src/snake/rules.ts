/**
 * Snake's rules, as pure functions over a game value.
 *
 * The same shape as Minesweeper's `rules.ts`, for the same reasons: no DOM, no Lit, no timer and no
 * `Math.random` on any path a test takes. Food placement arrives as an injected
 * {@link SnakeFoodPlacer}, so a test can put the food directly in front of the head and assert that
 * the snake grew *because it ate*, rather than merely that it is longer than it was.
 *
 * Time is not in here either. The element owns the clock and calls {@link step} once per tick, which
 * is what lets every rule below be exercised one move at a time without waiting for anything.
 *
 * Every transition returns a new game and mutates nothing, so the element can hold the whole game in
 * one `@state()` field and re-render on assignment.
 */

/** Board dimensions and the snake's opening length. Row-major throughout: index `y * width + x`. */
export interface SnakeConfig {
  /** Columns. */
  width: number;
  /** Rows. */
  height: number;
  /** How many cells the snake covers before it has eaten anything. */
  initialLength: number;
}

/** Which way the head is going. */
export type SnakeDirection = 'up' | 'down' | 'left' | 'right';

/**
 * How far along the game is.
 *
 * `ready` is separate from `paused` even though neither moves, because they answer "what does a key
 * press do" differently: a steer from `ready` starts a new game, while the pause key does nothing
 * until there is a game to pause.
 */
export type SnakeStatus = 'ready' | 'playing' | 'paused' | 'over' | 'won';

/**
 * Chooses where the next piece of food goes.
 *
 * Given every free cell, in index order, and expected to return one of them. An answer that is not
 * in the list (a test naming a cell the snake has since moved onto, say) falls back to the first
 * free cell rather than putting food under the snake, so a test placer never has to be a correct one.
 * @param free Every cell the snake does not cover. Never empty: a full board is a win, not a call.
 * @returns The cell index the food should appear in.
 */
export type SnakeFoodPlacer = (free: ReadonlyArray<number>) => number;

/** A whole game, as one immutable value. */
export interface SnakeGame extends SnakeConfig {
  /** Every cell the snake covers, **head first**. */
  readonly snake: ReadonlyArray<number>;
  /** The way the head went on the last step, which is what a reversal is judged against. */
  readonly direction: SnakeDirection;
  /**
   * Turns pressed since the last step, oldest first, at most {@link MAX_QUEUED_TURNS} of them.
   *
   * A queue rather than a single "next direction", because a player who taps up-then-left inside
   * one tick to make a tight U-turn means both. With one slot the second press overwrites the first,
   * and "left" on its own is a reversal and gets dropped, so the snake carries straight on into
   * whatever the player was turning away from.
   */
  readonly queued: ReadonlyArray<SnakeDirection>;
  /** Where the food is, or `undefined` once the snake fills the board. */
  readonly food: number | undefined;
  /** Pieces of food eaten. The element scales this for display. */
  readonly score: number;
  /** How far along the game is. */
  readonly status: SnakeStatus;
}

/**
 * How many turns may wait for the next step.
 *
 * Two is enough for any U-turn, and a cap is needed at all because a player mashing keys would
 * otherwise build a backlog the snake is still working through seconds later.
 */
const MAX_QUEUED_TURNS = 2;

/** Each direction's opposite, which is the one turn the snake may never make. */
const OPPOSITE: Record<SnakeDirection, SnakeDirection> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * The default placer: any free cell, uniformly.
 * @param free Every cell the snake does not cover.
 * @returns One of them.
 */
export const randomFoodPlacer: SnakeFoodPlacer = (free) => free[Math.floor(Math.random() * free.length)];

/**
 * Put a piece of food somewhere the snake is not.
 * @param config The board's dimensions.
 * @param snake The cells the snake covers.
 * @param placer Where the caller would like the food.
 * @returns The food's cell, or `undefined` when the snake covers every cell.
 */
function placeFood(config: SnakeConfig, snake: ReadonlyArray<number>, placer: SnakeFoodPlacer): number | undefined {
  const covered = new Set(snake);
  const free: number[] = [];
  for (let index = 0; index < config.width * config.height; index++) {
    if (!covered.has(index)) free.push(index);
  }
  if (!free.length) return undefined;
  const chosen = placer(free);
  return free.includes(chosen) ? chosen : free[0];
}

/**
 * The cell one step from `index` in `direction`, or `undefined` if that step leaves the board.
 *
 * The walls are solid, which is the classic rule: a wrapping board is a different and much easier
 * game, and the one people mean by "Snake" ends when you hit the edge.
 * @param config The board's dimensions.
 * @param index Where the head is.
 * @param direction Where it is going.
 * @returns The next cell, or `undefined` for a wall.
 */
function neighbour({ width, height }: SnakeConfig, index: number, direction: SnakeDirection): number | undefined {
  const x = index % width;
  const y = Math.floor(index / width);
  switch (direction) {
    case 'up':
      return y > 0 ? index - width : undefined;
    case 'down':
      return y < height - 1 ? index + width : undefined;
    case 'left':
      return x > 0 ? index - 1 : undefined;
    case 'right':
      return x < width - 1 ? index + 1 : undefined;
  }
}

/**
 * A new game: the snake laid out horizontally a quarter of the way down the board, facing right,
 * with one piece of food somewhere else.
 *
 * A quarter of the way down rather than in the middle, because the middle is where the window puts
 * its start message, centred on the board: a snake starting there was hidden behind it, so the
 * player could not see which way it faced before the first key press.
 *
 * Facing right with the body trailing left, so the first thing in front of the player is the widest
 * stretch of open board rather than the body. An `initialLength` longer than the half-row the head
 * sits in is clipped to fit, rather than wrapping the body onto the row above.
 * @param config Dimensions and opening length.
 * @param placer Where the food goes. Injected so tests are deterministic; defaults to random.
 * @returns A game in `ready` state.
 */
export function createGame(config: SnakeConfig, placer: SnakeFoodPlacer = randomFoodPlacer): SnakeGame {
  const headX = Math.floor(config.width / 2);
  const row = Math.floor(config.height / 4) * config.width;
  const length = Math.max(1, Math.min(config.initialLength, headX + 1));
  const snake = Array.from({ length }, (_unused, offset) => row + headX - offset);
  return {
    ...config,
    snake,
    direction: 'right',
    queued: [],
    food: placeFood(config, snake, placer),
    score: 0,
    status: 'ready',
  };
}

/**
 * Move a waiting game's food out of some cells, and do nothing once the game has started.
 *
 * For the window, whose start message covers the middle of the board: random food lands under it on
 * about one start in five, and a piece of food half hidden behind a banner looks broken on the one
 * screen that is meant to explain the game. Only a `ready` game, because once the snake moves, food
 * jumping about would be a change of rules rather than of presentation. The rules know nothing about
 * the message; the caller says which cells to avoid.
 * @param game The game.
 * @param avoid Cells the food should not be in.
 * @param placer Where the food goes, from the cells that are free and not avoided.
 * @returns The game with its food moved, or the same game when it is not waiting, its food is
 *   already clear, or there is nowhere else to put it.
 */
export function moveFoodFrom(
  game: SnakeGame,
  avoid: ReadonlySet<number>,
  placer: SnakeFoodPlacer = randomFoodPlacer,
): SnakeGame {
  if (game.status !== 'ready' || game.food === undefined || !avoid.has(game.food)) return game;
  const taken = new Set(game.snake);
  const clear: number[] = [];
  for (let index = 0; index < game.width * game.height; index++) {
    if (!taken.has(index) && !avoid.has(index)) clear.push(index);
  }
  if (!clear.length) return game;
  const chosen = placer(clear);
  return { ...game, food: clear.includes(chosen) ? chosen : clear[0] };
}

/**
 * Ask the snake to turn.
 *
 * The turn is queued rather than applied, and takes effect on the next {@link step}: turning is a
 * change of heading, not a move, and a snake that moved the moment a key went down would move at
 * the speed of the player's keyboard repeat rather than the game's.
 *
 * A steer also starts a `ready` game and resumes a `paused` one, so the arrow keys are all a player
 * ever needs. A press of the way the snake is already going, or of its reversal, still starts or
 * resumes, but queues nothing.
 * @param game The game to act on.
 * @param direction The way the player pressed.
 * @returns A new game, or the same one when the game is over.
 */
export function steer(game: SnakeGame, direction: SnakeDirection): SnakeGame {
  if (game.status === 'over' || game.status === 'won') return game;
  const status: SnakeStatus = 'playing';
  // Judged against the last *queued* turn, because that is the heading the snake will have when this
  // one applies: queued "up" from a snake going right makes "down" the reversal and "left" legal.
  const heading = game.queued[game.queued.length - 1] ?? game.direction;
  const accepted = direction !== heading && direction !== OPPOSITE[heading] && game.queued.length < MAX_QUEUED_TURNS;
  if (!accepted) return game.status === status ? game : { ...game, status };
  return { ...game, queued: [...game.queued, direction], status };
}

/**
 * Pause a running game, or resume a paused one.
 * @param game The game to act on.
 * @returns A new game, or the same one when there is nothing to pause or resume.
 */
export function togglePause(game: SnakeGame): SnakeGame {
  if (game.status === 'playing') return { ...game, status: 'paused' };
  if (game.status === 'paused') return { ...game, status: 'playing' };
  return game;
}

/**
 * Advance the game by one move.
 *
 * The tail is dropped *before* checking for a collision, so the head may move into the cell the tail
 * is leaving on the same step, as in every Snake since the original: a snake chasing its own tail
 * round a tight loop is legal and is how a long snake survives. On a step that eats, the tail stays,
 * so that cell is still occupied and running into it is a crash.
 *
 * A crash leaves the snake where it was rather than drawing the head inside the wall or on top of
 * its body, so the final board shows the player what they hit.
 * @param game The game to advance.
 * @param placer Where the next piece of food goes, if this step eats one.
 * @returns A new game, or the same one when the game is not running.
 */
export function step(game: SnakeGame, placer: SnakeFoodPlacer = randomFoodPlacer): SnakeGame {
  if (game.status !== 'playing') return game;
  const [turn, ...queued] = game.queued;
  const direction = turn ?? game.direction;
  const head = neighbour(game, game.snake[0], direction);
  if (head === undefined) return { ...game, direction, queued, status: 'over' };
  const eating = head === game.food;
  const body = eating ? game.snake : game.snake.slice(0, -1);
  if (body.includes(head)) return { ...game, direction, queued, status: 'over' };
  const snake = [head, ...body];
  if (!eating) return { ...game, snake, direction, queued };
  const food = placeFood(game, snake, placer);
  return {
    ...game,
    snake,
    direction,
    queued,
    food,
    score: game.score + 1,
    status: food === undefined ? 'won' : 'playing',
  };
}
