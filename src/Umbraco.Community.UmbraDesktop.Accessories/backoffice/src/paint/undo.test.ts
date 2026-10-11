import { expect } from '@open-wc/testing';
import { UndoPool } from './undo.js';
import { PAINT_UNDO_DEPTH } from './constants.js';

/**
 * Undo keeps whole copies of the picture, four bytes a pixel, and Paint can be open in several
 * windows at once. So the memory Undo may use is one budget shared by every open Paint window,
 * rather than a budget each: five windows on large photographs would otherwise hold five budgets.
 */

/** A picture `w` by `h`, which costs `w * h * 4` bytes as an undo step. */
const picture = (w = 10, h = 10) => new ImageData(w, h);

/** Bytes one {@link picture} of the default size costs. */
const STEP = 10 * 10 * 4;

it('keeps up to the undo depth of a small picture', () => {
  const history = new UndoPool(STEP * 100).history();
  for (let i = 0; i < PAINT_UNDO_DEPTH + 5; i++) history.push(picture());
  expect(history.length).to.equal(PAINT_UNDO_DEPTH);
});

it('keeps fewer steps of a larger picture, as many as the budget holds', () => {
  const pool = new UndoPool(STEP * 3);
  const history = pool.history();
  for (let i = 0; i < 5; i++) history.push(picture());
  expect(history.length).to.equal(3);
  expect(pool.used).to.equal(STEP * 3);
});

it('always keeps the newest step, even of a picture larger than the whole budget', () => {
  const pool = new UndoPool(STEP);
  const history = pool.history();
  history.push(picture(20, 20));
  history.push(picture(20, 20));
  expect(history.length).to.equal(1);
});

it('takes back the newest step first', () => {
  const history = new UndoPool(STEP * 10).history();
  const first = picture();
  const second = picture();
  history.push(first);
  history.push(second);
  expect(history.pop()).to.equal(second);
  expect(history.pop()).to.equal(first);
  expect(history.pop()).to.equal(undefined);
});

/** Two windows together stay within the one budget: the oldest step anywhere goes first. */
it('keeps every window together within one budget, dropping the oldest step of any', () => {
  const pool = new UndoPool(STEP * 3);
  const first = pool.history();
  const second = pool.history();
  first.push(picture());
  first.push(picture());
  second.push(picture());
  second.push(picture());
  expect(pool.used).to.equal(STEP * 3);
  expect([first.length, second.length], "the first window's oldest went").to.deep.equal([1, 2]);
});

/** A window whose steps another window's stroke took has to know, so its Undo button can say so. */
it('tells a window when another window took its steps', () => {
  const pool = new UndoPool(STEP * 2);
  const depths: number[] = [];
  const first = pool.history((depth) => depths.push(depth));
  const second = pool.history();
  first.push(picture());
  first.push(picture());
  second.push(picture());
  second.push(picture());
  expect(depths).to.deep.equal([1, 0]);
  expect(first.length).to.equal(0);
});

it('gives the memory back when a window closes', () => {
  const pool = new UndoPool(STEP * 10);
  const first = pool.history();
  const second = pool.history();
  first.push(picture());
  second.push(picture());
  first.release();
  expect(pool.used).to.equal(STEP);
  expect(first.length).to.equal(0);
});

/** A window moved in the page is disconnected and connected again, and Undo must work after it. */
it('takes a released window back into the pool when it is used again', () => {
  const pool = new UndoPool(STEP * 10);
  const history = pool.history();
  history.push(picture());
  history.release();
  history.push(picture());
  expect([history.length, pool.used]).to.deep.equal([1, STEP]);
});

it('empties one window without touching the others', () => {
  const pool = new UndoPool(STEP * 10);
  const first = pool.history();
  const second = pool.history();
  first.push(picture());
  second.push(picture());
  first.clear();
  expect([first.length, second.length, pool.used]).to.deep.equal([0, 1, STEP]);
});
