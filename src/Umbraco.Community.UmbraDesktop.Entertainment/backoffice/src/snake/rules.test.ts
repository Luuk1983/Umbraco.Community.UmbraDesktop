import { expect } from '@open-wc/testing';
import { createGame, moveFoodFrom, steer, step, togglePause } from './rules.js';
import type { SnakeConfig, SnakeFoodPlacer, SnakeGame } from './rules.js';

/**
 * A placer that puts the food exactly where a test says, falling back to the first free cell.
 *
 * Every case injects one of these, for the same reason Minesweeper's tests inject their mines: a
 * test that lets the food land at random can assert that the snake grew, but never that it grew
 * *because it ate*, which is the whole of the game.
 * @param cells Cell indices, in the order successive pieces of food should appear.
 * @returns A placer yielding those cells one per call.
 */
function foodAt(...cells: number[]): SnakeFoodPlacer {
  const queue = [...cells];
  return (free) => queue.shift() ?? free[0];
}

/**
 * A 10 by 10 board with a three-long snake.
 *
 * The snake starts a quarter of the way down, at row 2, head at column 5, facing right, so its cells
 * are 25, 24 and 23. Every case below reasons from those numbers.
 */
const CONFIG: SnakeConfig = { width: 10, height: 10, initialLength: 3 };

/** A game already under way, with the food parked in the far corner where nothing will reach it. */
function playing(placer: SnakeFoodPlacer = foodAt(99)): SnakeGame {
  return steer(createGame(CONFIG, placer), 'right');
}

describe('snake rules', () => {
  /**
   * A quarter of the way down rather than in the middle, because the middle is where the start
   * message sits, centred on the board, and the player has to see which way the snake faces.
   */
  it('starts a three-long snake a quarter of the way down, facing right, and waits for the player', () => {
    const game = createGame(CONFIG, foodAt(0));
    expect(game.snake, 'head first').to.deep.equal([25, 24, 23]);
    expect(game.direction).to.equal('right');
    expect(game.status, 'nothing moves until a key is pressed').to.equal('ready');
    expect(game.score).to.equal(0);
    expect(game.food).to.equal(0);
  });

  it('never places food on the snake, even when the placer asks it to', () => {
    const game = createGame(CONFIG, foodAt(24));
    expect(game.snake).to.not.include(game.food);
  });

  it('does not move while ready, and starts on the first steer', () => {
    const ready = createGame(CONFIG, foodAt(0));
    expect(step(ready, foodAt()), 'a tick before the first key is a no-op').to.equal(ready);
    expect(steer(ready, 'up').status).to.equal('playing');
  });

  it('starts on a press of the direction it is already facing', () => {
    const game = steer(createGame(CONFIG, foodAt(0)), 'right');
    expect(game.status).to.equal('playing');
    expect(game.queued, 'nothing to queue: it was going that way anyway').to.deep.equal([]);
  });

  it('moves one cell per step, the tail following the head', () => {
    const game = step(playing(), foodAt());
    expect(game.snake).to.deep.equal([26, 25, 24]);
  });

  it('turns on the next step, not immediately', () => {
    const turned = steer(playing(), 'up');
    expect(turned.snake, 'steering alone moves nothing').to.deep.equal([25, 24, 23]);
    const moved = step(turned, foodAt());
    expect(moved.snake[0], 'one row up from 25').to.equal(15);
    expect(moved.direction).to.equal('up');
  });

  it('ignores a reversal, which would otherwise be instant death', () => {
    const game = steer(playing(), 'left');
    expect(game.queued).to.deep.equal([]);
    expect(step(game, foodAt()).snake[0], 'still heading right').to.equal(26);
  });

  it('queues two quick turns so a fast U-turn is not swallowed', () => {
    // Up then left inside one tick: without a queue the second press would overwrite the first,
    // and "left" on its own is a reversal and would be dropped.
    const game = steer(steer(playing(), 'up'), 'left');
    expect(game.queued).to.deep.equal(['up', 'left']);
    const once = step(game, foodAt());
    const twice = step(once, foodAt());
    expect(once.snake[0]).to.equal(15);
    expect(twice.snake[0]).to.equal(14);
  });

  it('judges a reversal against the last queued turn, not the current heading', () => {
    // Heading right, queued up: down is now the reversal, and left is legal.
    const game = steer(steer(playing(), 'up'), 'down');
    expect(game.queued).to.deep.equal(['up']);
  });

  it('grows by one and scores when it eats', () => {
    const game = step(playing(foodAt(26, 0)), foodAt(0));
    expect(game.snake, 'the tail stays put for the step it eats on').to.deep.equal([26, 25, 24, 23]);
    expect(game.score).to.equal(1);
    expect(game.food, 'a new piece appears').to.equal(0);
  });

  it('ends the game when it hits a wall', () => {
    let game = playing();
    for (let i = 0; i < 4; i++) game = step(game, foodAt());
    expect(game.snake[0], 'at the right-hand edge').to.equal(29);
    expect(game.status).to.equal('playing');
    game = step(game, foodAt());
    expect(game.status, 'one more step goes through the wall').to.equal('over');
    expect(game.snake[0], 'the snake is left where it crashed').to.equal(29);
  });

  it('does not wrap around the left or top edges either', () => {
    let game = steer(playing(), 'up');
    for (let i = 0; i < 2; i++) game = step(game, foodAt());
    expect(game.snake[0], 'top row').to.equal(5);
    expect(step(game, foodAt()).status).to.equal('over');
  });

  it('ends the game when it runs into itself', () => {
    // Grow to five, then turn in a tight square back into the body.
    let game = playing(foodAt(26, 27, 99));
    game = step(game, foodAt(27));
    game = step(game, foodAt(99));
    expect(game.snake.length).to.equal(5);
    for (const direction of ['up', 'left', 'down'] as const) {
      game = step(steer(game, direction), foodAt());
    }
    expect(game.status).to.equal('over');
  });

  it('may move into the cell its own tail is leaving', () => {
    // A four-long snake chasing its tail round a 2 by 2 square never collides, because the tail
    // moves out on the same step the head moves in.
    let game = playing(foodAt(26, 99));
    game = step(game, foodAt(99));
    expect(game.snake).to.deep.equal([26, 25, 24, 23]);
    game = step(steer(game, 'up'), foodAt());
    game = step(steer(game, 'left'), foodAt());
    game = step(steer(game, 'down'), foodAt());
    expect(game.snake[0], 'the head is where the tail was').to.equal(25);
    expect(game.status).to.equal('playing');
  });

  it('is won when the snake fills the board', () => {
    const tiny: SnakeConfig = { width: 3, height: 1, initialLength: 2 };
    let game = createGame(tiny, foodAt(2));
    expect(game.snake).to.deep.equal([1, 0]);
    game = step(steer(game, 'right'), foodAt());
    expect(game.status).to.equal('won');
    expect(game.food, 'nowhere left to put any').to.equal(undefined);
  });

  it('pauses and resumes, and does not move while paused', () => {
    const paused = togglePause(playing());
    expect(paused.status).to.equal('paused');
    expect(step(paused, foodAt())).to.equal(paused);
    expect(togglePause(paused).status).to.equal('playing');
  });

  it('resumes on a steer, so an arrow key is enough to carry on', () => {
    expect(steer(togglePause(playing()), 'up').status).to.equal('playing');
  });

  it('ignores every gesture once the game is over', () => {
    let game = playing();
    for (let i = 0; i < 5; i++) game = step(game, foodAt());
    expect(game.status).to.equal('over');
    expect(steer(game, 'up')).to.equal(game);
    expect(togglePause(game)).to.equal(game);
    expect(step(game, foodAt())).to.equal(game);
  });

  it('does not pause a game that has not started', () => {
    const ready = createGame(CONFIG, foodAt(0));
    expect(togglePause(ready)).to.equal(ready);
  });

  /**
   * The window moves the food out from under its start message before the first key press, so a
   * game that is waiting can have its food moved, and only then: once the snake is moving, food
   * jumping about would be a change of rules.
   */
  it('moves waiting food out of the cells it is asked to avoid, and never once play has started', () => {
    const ready = createGame(CONFIG, foodAt(50));
    let offered: ReadonlyArray<number> = [];
    const moved = moveFoodFrom(ready, new Set([50, 51]), (free) => {
      offered = free;
      return 60;
    });
    expect(offered.filter((cell) => cell === 50 || cell === 51), 'the placer is only offered cells outside the set').to.deep.equal([]);
    expect(offered.filter((cell) => ready.snake.includes(cell)), 'nor under the snake').to.deep.equal([]);
    expect(offered.length, 'every other cell is offered').to.equal(CONFIG.width * CONFIG.height - 2 - ready.snake.length);
    expect(moved.food).to.equal(60);
    expect(moved.snake).to.deep.equal(ready.snake);
    expect(moveFoodFrom(ready, new Set([0]), foodAt(60)), 'food already clear stays put').to.equal(ready);
    const started = steer(ready, 'right');
    expect(moveFoodFrom(started, new Set([50]), foodAt(60))).to.equal(started);
  });

  it('leaves the food where it is when every free cell is to be avoided', () => {
    const ready = createGame({ width: 3, height: 1, initialLength: 2 }, foodAt(2));
    expect(moveFoodFrom(ready, new Set([2]), foodAt(2))).to.equal(ready);
  });
});
