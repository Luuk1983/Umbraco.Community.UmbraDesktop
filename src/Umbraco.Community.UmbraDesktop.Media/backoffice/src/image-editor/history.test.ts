import { expect } from '@open-wc/testing';
import { Gesture, History } from './history.js';

/**
 * Undo and redo for every change, through saves: undo can step back past a save, and the unsaved dot
 * follows the point in the history that was saved (design §4.2, Review Focus 2).
 */

it('walks the states with push, undo and redo', () => {
  const history = new History('a');
  expect(history.canUndo).to.equal(false);
  history.push('b');
  history.push('c');
  expect(history.current).to.equal('c');
  history.undo();
  expect(history.current).to.equal('b');
  expect(history.canRedo).to.equal(true);
  history.redo();
  expect(history.current).to.equal('c');
  expect(history.canRedo).to.equal(false);
  history.undo();
  history.undo();
  history.undo();
  expect(history.current, 'undo past the start does nothing').to.equal('a');
});

it('drops the redo branch on a new change', () => {
  const history = new History('a');
  history.push('b');
  history.undo();
  history.push('x');
  expect(history.canRedo).to.equal(false);
  history.undo();
  expect(history.current).to.equal('a');
});

it('is dirty away from the saved point and clean back on it, either way', () => {
  const history = new History('a');
  expect(history.dirty).to.equal(false);
  history.push('b');
  expect(history.dirty).to.equal(true);
  history.markSaved();
  expect(history.dirty).to.equal(false);
  expect(history.saved).to.equal('b');
  history.undo();
  expect(history.dirty, 'undo past the save').to.equal(true);
  expect(history.saved, 'still what was saved').to.equal('b');
  history.redo();
  expect(history.dirty, 'redo back to it').to.equal(false);
});

it('stays dirty on a new branch, even at the saved depth', () => {
  const history = new History('a');
  history.push('b');
  history.markSaved();
  history.undo();
  history.push('c');
  expect(history.dirty).to.equal(true);
  expect(history.saved).to.equal('b');
});

it('adds one step for a whole drag, and undo goes back to before it', () => {
  const history = new History(0);
  const gesture = new Gesture(history);
  for (let i = 1; i <= 30; i++) gesture.preview(i);
  expect(history.current, 'previews show').to.equal(30);
  gesture.commit();
  expect(history.current).to.equal(30);
  history.undo();
  expect(history.current).to.equal(0);
  expect(history.canUndo).to.equal(false);
});

it('puts back the state before a cancelled drag, and adds nothing', () => {
  const history = new History(0);
  history.push(1);
  const gesture = new Gesture(history);
  gesture.preview(5);
  gesture.preview(6);
  gesture.cancel();
  expect(history.current).to.equal(1);
  history.undo();
  expect(history.current).to.equal(0);
});

it('adds nothing for a drag that previewed nothing', () => {
  const history = new History(0);
  new Gesture(history).commit();
  expect(history.canUndo).to.equal(false);
});

it('starts over clean for another file', () => {
  const history = new History('a');
  history.push('b');
  history.markSaved();
  history.push('c');
  history.reset('z');
  expect(history.current).to.equal('z');
  expect(history.saved).to.equal('z');
  expect(history.canUndo).to.equal(false);
  expect(history.canRedo).to.equal(false);
  expect(history.dirty).to.equal(false);
});
