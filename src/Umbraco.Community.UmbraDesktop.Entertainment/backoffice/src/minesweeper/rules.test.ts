import { expect } from '@open-wc/testing';
import { createBoard, remainingMines, reveal, toggleFlag } from './rules.js';
import type { MinesweeperBoard, MinesweeperPlacer } from './rules.js';

/**
 * A placer that puts the mines exactly where a test says.
 *
 * Every case here injects one of these rather than letting the game choose, because a test that
 * places mines at random and then asserts a count is only testing that `length` works: it cannot
 * assert that *this* cell floods and *that* one does not, which is the whole of Minesweeper. The
 * placer is the seam the design asks for and this is the only implementation the tests use.
 * @param indices Cell indices, row-major, to mine.
 * @returns A placer yielding exactly those indices.
 */
function placeAt(indices: number[]): MinesweeperPlacer {
  return () => indices;
}

/**
 * A 5 by 5 board whose mines form a solid wall down the middle column, splitting it into two
 * regions that cannot flood into each other.
 *
 * ```
 *  .  1  *  2  .        0  1  2  3  4
 *  .  3  *  3  .        5  6  7  8  9
 *  .  3  *  3  .       10 11 12 13 14
 *  .  3  *  3  .       15 16 17 18 19
 *  .  2  *  2  .       20 21 22 23 24
 * ```
 *
 * The wall is what makes "the flood stops at the numbered border" assertable: a board with mines
 * scattered in a corner floods to the whole rest of the grid and wins on the first click, which
 * proves the flood runs but not that it ever stops.
 */
const WALL_CONFIG = { width: 5, height: 5, mineCount: 5 };
/** The wall itself: column 2, top to bottom. */
const WALL_MINES = [2, 7, 12, 17, 22];
/** Every index in one column of {@link WALL_CONFIG}, top to bottom. */
function column(index: number): number[] {
  return [0, 1, 2, 3, 4].map((row) => row * WALL_CONFIG.width + index);
}
/**
 * The wall board after its first click, on the bottom-left corner.
 *
 * That corner has no adjacent mine, so no mine has to be relocated for first-click safety and the
 * layout every case reasons about is the one {@link WALL_MINES} names. Cases that need a board
 * mid-game start here rather than repeating the click.
 */
function wallAfterFirstClick(): MinesweeperBoard {
  return reveal(createBoard(WALL_CONFIG, placeAt(WALL_MINES)), 20);
}
/** The indices a board currently shows as revealed, ascending. */
function revealedIndices(board: MinesweeperBoard): number[] {
  return board.cells.flatMap((cell, index) => (cell.revealed ? [index] : []));
}

it('starts with exactly the requested number of mines, none revealed and none flagged', () => {
  const board = createBoard(WALL_CONFIG, placeAt(WALL_MINES));
  expect(board.cells.filter((cell) => cell.mine).length, 'mine count').to.equal(5);
  expect(board.cells.some((cell) => cell.revealed), 'nothing revealed yet').to.equal(false);
  expect(board.cells.some((cell) => cell.flagged), 'nothing flagged yet').to.equal(false);
  expect(board.status).to.equal('ready');
});

it('never lets the first click hit a mine, even when the placer put one there', () => {
  const mined = createBoard(WALL_CONFIG, placeAt([20, 2, 7, 12, 17]));
  expect(mined.cells[20].mine, 'the placer really did mine the corner').to.equal(true);
  const board = reveal(mined, 20);
  expect(board.cells[20].mine, 'the cell the player clicked first').to.equal(false);
  expect(board.cells.filter((cell) => cell.mine).length, 'the mine moved, it did not vanish').to.equal(5);
  expect(board.status, 'a first click cannot lose').to.equal('playing');
});

it('opens a zero-adjacency region on the first click, not merely a safe cell', () => {
  const board = reveal(createBoard({ width: 3, height: 3, mineCount: 1 }, placeAt([4])), 0);
  expect(board.cells[0].adjacent, 'the first cell clicked has no adjacent mine').to.equal(0);
  expect(revealedIndices(board).length, 'so it flooded rather than opening one cell').to.be.greaterThan(1);
});

it('falls back to a merely safe first click when the board is too crowded for a clear region', () => {
  const config = { width: 3, height: 3, mineCount: 8 };
  const board = reveal(createBoard(config, placeAt([0, 1, 2, 3, 4, 5, 6, 7])), 4);
  expect(board.cells[4].mine, 'still never a mine').to.equal(false);
  expect(board.cells[4].adjacent, 'but there is nowhere for a clear region to go').to.equal(8);
  expect(board.status, 'not a loss').to.not.equal('lost');
});

it('floods a zero-adjacency cell to its whole region and stops at the numbered border', () => {
  const board = wallAfterFirstClick();
  const expected = [...column(0), ...column(1)].sort((a, b) => a - b);
  expect(revealedIndices(board), 'the left region and its border, and nothing across the wall').to.deep.equal(expected);
  expect(board.cells.some((cell) => cell.mine && cell.revealed), 'no mine was opened').to.equal(false);
});

it('reveals only the cell itself when it has an adjacent mine', () => {
  const before = wallAfterFirstClick();
  const after = reveal(before, 8);
  const opened = revealedIndices(after).filter((index) => !before.cells[index].revealed);
  expect(after.cells[8].adjacent, 'cell 8 is a numbered cell').to.equal(3);
  expect(opened, 'only cell 8 opened').to.deep.equal([8]);
});

it('toggles a flag on and off again', () => {
  const flagged = toggleFlag(createBoard(WALL_CONFIG, placeAt(WALL_MINES)), 8);
  expect(flagged.cells[8].flagged, 'first flag gesture').to.equal(true);
  expect(toggleFlag(flagged, 8).cells[8].flagged, 'second flag gesture clears it').to.equal(false);
});

it('refuses to reveal a flagged cell, so a marked mine cannot be clicked by accident', () => {
  const flagged = toggleFlag(wallAfterFirstClick(), 12);
  const after = reveal(flagged, 12);
  expect(after.cells[12].revealed, 'the flag protected it').to.equal(false);
  expect(after.status, 'and the game did not end').to.equal('playing');
});

it('counts remaining mines from the flags placed, not from where the mines are', () => {
  const board = wallAfterFirstClick();
  expect(remainingMines(board), 'nothing flagged yet').to.equal(5);
  const wrong = toggleFlag(toggleFlag(board, 8), 13);
  expect(remainingMines(wrong), 'two flags on two cells that hold no mine at all').to.equal(3);
});

it('loses on a mine and reveals the whole board with it', () => {
  const board = reveal(wallAfterFirstClick(), 12);
  expect(board.status).to.equal('lost');
  expect(revealedIndices(board).length, 'every cell is shown once the game is lost').to.equal(25);
});

it('wins when every cell without a mine is revealed, with no mine flagged', () => {
  const board = reveal(createBoard({ width: 3, height: 3, mineCount: 1 }, placeAt([0])), 8);
  expect(board.status).to.equal('won');
  expect(board.cells.some((cell) => cell.flagged), 'won without flagging anything').to.equal(false);
  expect(board.cells[0].mine, 'and the mine was never opened').to.equal(true);
});

it('treats revealing an already-revealed cell as a no-op rather than an error', () => {
  const before = wallAfterFirstClick();
  expect(reveal(before, 20), 'clicking the same cell twice changes nothing').to.deep.equal(before);
});

it('ignores every gesture once the game is over', () => {
  const lost = reveal(wallAfterFirstClick(), 12);
  expect(reveal(lost, 13), 'no more reveals').to.deep.equal(lost);
  expect(toggleFlag(lost, 13), 'no more flags').to.deep.equal(lost);
});
