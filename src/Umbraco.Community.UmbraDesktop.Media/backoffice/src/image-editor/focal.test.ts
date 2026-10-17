import { expect } from '@open-wc/testing';
import { resetsFocalPoint } from './focal.js';
import { flip, rotate } from './geometry.js';
import { initialState } from './state.js';
import type { EditorState } from './state.js';

/**
 * Design D8: a save whose picture was cropped, rotated or flipped since the last save resets the
 * item's focal point and named crops; resize, adjust, markup and redact keep them. Compared with the
 * state last saved, not the state opened, because undo can step back past a save.
 */

const opened = initialState({ w: 600, h: 400 });
const croppedState: EditorState = { ...opened, crop: { x: 0, y: 0, w: 300, h: 200 } };

it('keeps them when nothing changed', () => {
  expect(resetsFocalPoint(opened, opened)).to.equal(false);
  expect(resetsFocalPoint(opened, { ...opened })).to.equal(false);
});

it('keeps them for a resize, an adjustment, a mark or a region', () => {
  expect(resetsFocalPoint(opened, { ...opened, size: { w: 300, h: 200 } })).to.equal(false);
  expect(resetsFocalPoint(opened, { ...opened, adjust: { ...opened.adjust, exposure: 40 } })).to.equal(false);
  expect(
    resetsFocalPoint(opened, {
      ...opened,
      marks: [{ id: 'm', kind: 'box', colour: '#000', width: 2, data: { x: 1, y: 1, w: 9, h: 9 } }],
    }),
  ).to.equal(false);
  expect(
    resetsFocalPoint(opened, { ...opened, regions: [{ id: 'r', style: 'blur', strength: 8, rect: { x: 1, y: 1, w: 9, h: 9 } }] }),
  ).to.equal(false);
});

it('resets them for a crop, a turn or a flip', () => {
  expect(resetsFocalPoint(opened, croppedState)).to.equal(true);
  expect(resetsFocalPoint(opened, rotate(opened, 'right'))).to.equal(true);
  expect(resetsFocalPoint(opened, flip(opened, 'h'))).to.equal(true);
  expect(resetsFocalPoint(opened, flip(opened, 'v'))).to.equal(true);
});

it('compares with what was saved: undoing a saved crop is a reframe too', () => {
  // Cropped, saved, then undone back to the uncropped picture: the item on the server is the cropped
  // one, so saving the whole picture over it reframes it again.
  expect(resetsFocalPoint(croppedState, opened)).to.equal(true);
});

it('keeps them when a turn was turned back', () => {
  expect(resetsFocalPoint(opened, rotate(rotate(opened, 'right'), 'left'))).to.equal(false);
});

it('treats a crop of the whole picture as no crop', () => {
  expect(resetsFocalPoint(opened, { ...opened, crop: { x: 0, y: 0, w: 600, h: 400 } })).to.equal(false);
});
